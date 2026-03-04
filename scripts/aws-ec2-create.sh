#!/usr/bin/env bash
# aws-ec2-create.sh — Launch an EC2 instance pre-configured for Delerium k3s.
#
# Prerequisites:
#   - AWS CLI configured (aws configure)
#   - An SSH key pair in your AWS account
#
# Usage:
#   ./scripts/aws-ec2-create.sh
#   # — or with env vars —
#   KEY_NAME=my-key REGION=us-east-1 INSTANCE_TYPE=t3.small ./scripts/aws-ec2-create.sh

set -euo pipefail

REGION="${REGION:-us-east-1}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.small}"
KEY_NAME="${KEY_NAME:-}"
VOLUME_SIZE="${VOLUME_SIZE:-20}"  # GB

echo "============================================"
echo "  Delerium — Create AWS EC2 Instance"
echo "============================================"
echo ""

# ---------- Validate AWS CLI ----------
if ! command -v aws &>/dev/null; then
  echo "ERROR: AWS CLI not found. Install with: brew install awscli"
  exit 1
fi

if ! aws sts get-caller-identity &>/dev/null; then
  echo "ERROR: AWS credentials not configured. Run: aws configure"
  exit 1
fi

echo "AWS Account: $(aws sts get-caller-identity --query Account --output text)"
echo "Region:      $REGION"
echo ""

# ---------- SSH Key ----------
if [ -z "$KEY_NAME" ]; then
  echo "Available SSH key pairs in $REGION:"
  aws ec2 describe-key-pairs --region "$REGION" --query 'KeyPairs[*].KeyName' --output table
  echo ""
  read -rp "Enter SSH key pair name: " KEY_NAME
fi

# ---------- Find latest Ubuntu 22.04 AMI ----------
echo "Finding latest Ubuntu 22.04 AMI..."
AMI_ID=$(aws ec2 describe-images \
  --region "$REGION" \
  --owners 099720109477 \
  --filters \
    "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
    "Name=state,Values=available" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --output text)
echo "AMI: $AMI_ID"
echo ""

# ---------- Create Security Group ----------
SG_NAME="delerium-k3s-sg"
echo "Creating security group: $SG_NAME"

VPC_ID=$(aws ec2 describe-vpcs --region "$REGION" \
  --filters "Name=isDefault,Values=true" \
  --query 'Vpcs[0].VpcId' --output text)

SG_ID=$(aws ec2 describe-security-groups --region "$REGION" \
  --filters "Name=group-name,Values=$SG_NAME" "Name=vpc-id,Values=$VPC_ID" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || echo "None")

if [ "$SG_ID" = "None" ] || [ -z "$SG_ID" ]; then
  SG_ID=$(aws ec2 create-security-group --region "$REGION" \
    --group-name "$SG_NAME" \
    --description "Delerium k3s - HTTP, HTTPS, SSH, k8s API" \
    --vpc-id "$VPC_ID" \
    --query 'GroupId' --output text)

  # SSH
  aws ec2 authorize-security-group-ingress --region "$REGION" \
    --group-id "$SG_ID" --protocol tcp --port 22 --cidr 0.0.0.0/0
  # HTTP
  aws ec2 authorize-security-group-ingress --region "$REGION" \
    --group-id "$SG_ID" --protocol tcp --port 80 --cidr 0.0.0.0/0
  # HTTPS
  aws ec2 authorize-security-group-ingress --region "$REGION" \
    --group-id "$SG_ID" --protocol tcp --port 443 --cidr 0.0.0.0/0
  # k3s API (restrict in production)
  aws ec2 authorize-security-group-ingress --region "$REGION" \
    --group-id "$SG_ID" --protocol tcp --port 6443 --cidr 0.0.0.0/0

  echo "Created security group: $SG_ID"
else
  echo "Using existing security group: $SG_ID"
fi
echo ""

# ---------- Launch Instance ----------
echo "Launching $INSTANCE_TYPE instance..."

INSTANCE_ID=$(aws ec2 run-instances --region "$REGION" \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=$VOLUME_SIZE,VolumeType=gp3}" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=delerium-k3s}]" \
  --query 'Instances[0].InstanceId' --output text)

echo "Instance: $INSTANCE_ID"
echo "Waiting for instance to be running..."
aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE_ID"

PUBLIC_IP=$(aws ec2 describe-instances --region "$REGION" \
  --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

echo ""
echo "============================================"
echo "  EC2 Instance Ready"
echo "============================================"
echo ""
echo "  Instance ID : $INSTANCE_ID"
echo "  Public IP   : $PUBLIC_IP"
echo "  Instance    : $INSTANCE_TYPE"
echo "  Region      : $REGION"
echo "  Disk        : ${VOLUME_SIZE}GB gp3"
echo ""
echo "Next steps:"
echo "  1. SSH in:"
echo "     ssh -i ~/.ssh/${KEY_NAME}.pem ubuntu@${PUBLIC_IP}"
echo ""
echo "  2. Clone the repo and run setup:"
echo "     git clone https://github.com/<your-repo>/delerium-paste.git"
echo "     cd delerium-paste"
echo "     sudo ./scripts/aws-k3s-setup.sh"
echo ""
echo "  3. Point DNS to: $PUBLIC_IP"
echo ""
echo "  4. (Optional) Allocate an Elastic IP for a stable address:"
echo "     aws ec2 allocate-address --region $REGION"
echo "     aws ec2 associate-address --instance-id $INSTANCE_ID --allocation-id eipalloc-xxx"
echo ""
echo "Estimated monthly cost: ~\$15 (t3.small on-demand)"
echo ""
