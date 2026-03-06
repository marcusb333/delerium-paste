# Delirium Security Checklist for Headless Environments

## Pre-Deployment Security

- [ ] **Environment Variables**: Secure `.env` file with strong `DELETION_TOKEN_PEPPER`
- [ ] **User Permissions**: Running as non-root user
- [ ] **Network Security**: Firewall configured (ports 80, 443 only)
- [ ] **SSL/TLS**: HTTPS enabled with valid certificates
- [ ] **System Updates**: OS and Docker updated to latest versions

## Runtime Security

- [ ] **Container Security**: Read-only filesystems, dropped capabilities
- [ ] **Resource Limits**: Memory and CPU limits configured
- [ ] **Health Checks**: Automated health monitoring active
- [ ] **Log Monitoring**: Log rotation and monitoring configured
- [ ] **Backup Strategy**: Regular automated backups

## Operational Security

- [ ] **Access Control**: SSH key authentication only
- [ ] **Monitoring**: System resource monitoring active
- [ ] **Incident Response**: Logs and monitoring alerts configured
- [ ] **Update Strategy**: Automated security updates enabled
- [ ] **Recovery Plan**: Backup and restore procedures tested

## Security Commands

```bash
# Check security status
make security-check

# Run security monitoring
make monitor

# Create backup
make backup

# View security logs
make logs
```

## Emergency Procedures

1. **Service Down**: Check `make logs` and `make health-check`
2. **High Resource Usage**: Check `make monitor` and restart services
3. **Security Incident**: Check logs, stop services, investigate
4. **Data Recovery**: Use backup scripts to restore from latest backup
