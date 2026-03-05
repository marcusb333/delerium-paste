# C4 Architecture Model for Delirium

This document follows the [C4 model](https://c4model.com/) for visualizing software architecture at multiple levels of abstraction.

## Level 1: System Context Diagram

Shows Delirium in the context of users and external systems.

```mermaid
graph TB
    User[("?? User<br/>(Person)<br/>Wants to share sensitive<br/>information securely")]
    
    Delirium["?? Delirium<br/>(Software System)<br/>Zero-knowledge paste system with<br/>client-side encryption"]
    
    Browser["?? Web Browser<br/>(External System)<br/>Provides Web Crypto API<br/>for encryption"]
    
    User -->|"Creates/views pastes<br/>[HTTPS]"| Delirium
    Delirium -->|"Uses for<br/>encryption"| Browser
    
    style Delirium fill:#1168bd,stroke:#0b4884,color:#ffffff
    style User fill:#08427b,stroke:#052e56,color:#ffffff
    style Browser fill:#999999,stroke:#6b6b6b,color:#ffffff
```

**Key Points:**

- **Zero-knowledge**: Server never sees unencrypted content
- **Client-side encryption**: All encryption happens in browser
- **Privacy-first**: No accounts, no tracking, no analytics

---

## Level 2: Container Diagram

Shows the high-level technology choices and how containers communicate.

```mermaid
graph TB
    subgraph "User's Device"
        Browser["?? Web Browser<br/>(Container: Browser)<br/>Renders UI and handles<br/>client-side encryption"]
    end
    
    subgraph "Delirium System"
        API["? Ktor Application<br/>(Container: Ktor/Kotlin)<br/>Serves static frontend +<br/>REST API for paste CRUD,<br/>PoW verification, rate limiting"]

        DB[("?? Database<br/>(Container: PostgreSQL)<br/>Stores encrypted pastes<br/>with metadata")]
    end

    Browser -->|"Retrieves SPA<br/>[HTTPS/HTTP]"| API
    Browser -->|"API calls<br/>[HTTPS/JSON]"| API
    API -->|"Reads/writes<br/>[SQL]"| DB

    style Browser fill:#1168bd,stroke:#0b4884,color:#ffffff
    style API fill:#1168bd,stroke:#0b4884,color:#ffffff
    style DB fill:#1168bd,stroke:#0b4884,color:#ffffff
```

**Technology Choices:**

- **Frontend**: TypeScript SPA with Web Crypto API
- **Backend**: Ktor (Kotlin) REST API on JVM, also serves static frontend files from `/app/static/`
- **Database**: PostgreSQL with Exposed SQL library
- **Deployment**: Docker Compose orchestration (single `delerium-server` image + PostgreSQL)

---

## Level 3: Component Diagram - Frontend (Current State)

Shows the internal structure of the TypeScript client **before modularization**.

```mermaid
graph TB
    subgraph "Browser Container"
        subgraph "TypeScript Application (Monolithic)"
            App["?? app.ts<br/>(Component: 505 lines)<br/>DOES EVERYTHING:<br/>? Crypto ? PoW ? API ? UI ? Routing"]
            Security["?? security.ts<br/>(Component: 475 lines)<br/>? Validation<br/>? Password crypto<br/>? Security utilities"]
            Delete["??? delete.ts<br/>(Component: 63 lines)<br/>? Delete page logic"]
        end
        
        WebCrypto["?? Web Crypto API<br/>(Browser API)<br/>AES-GCM encryption"]
        
        App -->|"Uses for<br/>encryption"| WebCrypto
        App -->|"Uses for<br/>validation"| Security
    end
    
    API["? API Application<br/>(External)"]
    
    App -->|"HTTP requests<br/>[JSON/REST]"| API
    Delete -->|"HTTP DELETE<br/>[JSON/REST]"| API
    
    style App fill:#ff6b6b,stroke:#c92a2a,color:#ffffff
    style Security fill:#ff6b6b,stroke:#c92a2a,color:#ffffff
    style Delete fill:#ff6b6b,stroke:#c92a2a,color:#ffffff
    style WebCrypto fill:#1168bd,stroke:#0b4884,color:#ffffff
```

**Problems with Current State:**

- ? `app.ts` has too many responsibilities (SRP violation)
- ? Hard to test components in isolation
- ? Difficult to extend or customize
- ? Tight coupling between layers

---

## Level 3: Component Diagram - Frontend (Target Modular Architecture)

Shows the **target** modular architecture after refactoring (13 PRs).

```mermaid
graph TB
    subgraph "Browser Container"
        subgraph "Presentation Layer"
            Pages["?? Page Controllers<br/>(Component)<br/>? CreatePage<br/>? ViewPage<br/>? DeletePage"]
            Components["?? UI Components<br/>(Component)<br/>? Forms<br/>? Buttons<br/>? Alerts"]
            Router["?? Router<br/>(Component)<br/>Client-side routing"]
        end
        
        subgraph "Application Layer"
            UseCases["?? Use Cases<br/>(Component)<br/>? CreatePasteUseCase<br/>? ViewPasteUseCase<br/>? DeletePasteUseCase"]
            Services["?? Services<br/>(Component)<br/>? PasteService<br/>? StateManager"]
        end
        
        subgraph "Core Domain Layer"
            Models["?? Domain Models<br/>(Component)<br/>? Paste<br/>? Result<T>"]
            Validators["? Validators<br/>(Component)<br/>? Content size<br/>? Password strength"]
            Interfaces["?? Interfaces<br/>(Component)<br/>? ICryptoProvider<br/>? IApiClient<br/>? IPowSolver"]
        end
        
        subgraph "Infrastructure Layer"
            CryptoImpl["?? Crypto Provider<br/>(Component)<br/>AesGcmCryptoProvider<br/>(implements ICryptoProvider)"]
            ApiClient["?? API Client<br/>(Component)<br/>HttpApiClient<br/>(implements IApiClient)"]
            PowSolver["?? PoW Solver<br/>(Component)<br/>WebWorkerPowSolver<br/>(implements IPowSolver)"]
        end
        
        DI["?? DI Container<br/>(Component)<br/>Dependency injection<br/>and wiring"]
        
        WebCrypto["?? Web Crypto API<br/>(Browser API)"]
    end
    
    API["? API Application<br/>(External)"]
    
    %% Presentation to Application
    Pages -->|uses| UseCases
    Pages -->|uses| Components
    Pages -->|uses| Router
    
    %% Application to Core
    UseCases -->|uses| Models
    UseCases -->|uses| Validators
    UseCases -->|depends on| Interfaces
    Services -->|uses| Models
    
    %% Infrastructure implements Core
    CryptoImpl -.->|implements| Interfaces
    ApiClient -.->|implements| Interfaces
    PowSolver -.->|implements| Interfaces
    
    %% Infrastructure to external
    CryptoImpl -->|uses| WebCrypto
    ApiClient -->|calls| API
    
    %% DI wiring
    DI -->|injects| UseCases
    DI -->|provides| CryptoImpl
    DI -->|provides| ApiClient
    DI -->|provides| PowSolver
    
    style Pages fill:#51cf66,stroke:#2f9e44,color:#ffffff
    style Components fill:#51cf66,stroke:#2f9e44,color:#ffffff
    style Router fill:#51cf66,stroke:#2f9e44,color:#ffffff
    style UseCases fill:#4dabf7,stroke:#1c7ed6,color:#ffffff
    style Services fill:#4dabf7,stroke:#1c7ed6,color:#ffffff
    style Models fill:#ffd43b,stroke:#fab005,color:#000000
    style Validators fill:#ffd43b,stroke:#fab005,color:#000000
    style Interfaces fill:#ffd43b,stroke:#fab005,color:#000000
    style CryptoImpl fill:#ff8787,stroke:#fa5252,color:#ffffff
    style ApiClient fill:#ff8787,stroke:#fa5252,color:#ffffff
    style PowSolver fill:#ff8787,stroke:#fa5252,color:#ffffff
    style DI fill:#9775fa,stroke:#7950f2,color:#ffffff
```

**Benefits of Target Architecture:**

- ? Clear separation of concerns (Presentation, Application, Domain, Infrastructure)
- ? Dependency inversion (depend on interfaces, not implementations)
- ? Easy to test (mock interfaces in tests)
- ? Easy to extend (implement interfaces for custom behavior)
- ? Plugin architecture for customization

**Dependency Flow:**

```text
Presentation ? Application ? Core Domain ? Infrastructure
                              (no dependencies)    ?
                                              External Systems
```

**Extension Points:**

- Implement `ICryptoProvider` for custom encryption
- Implement `IApiClient` for custom API backends
- Implement `IPowSolver` for alternative PoW algorithms

---

## Level 3: Component Diagram - Backend (Current State)

Shows the internal structure of the Ktor backend **before modularization**.

```mermaid
graph TB
    subgraph "API Application Container"
        App["?? App.kt<br/>(Component)<br/>? Configuration loading<br/>? Plugin setup<br/>? DI initialization"]
        
        Routes["?? Routes.kt<br/>(Component)<br/>? POST /api/pastes<br/>? GET /api/pastes/:id<br/>? DELETE /api/pastes/:id<br/>? GET /api/pow"]
        
        Models["?? Models.kt<br/>(Component)<br/>? CreatePasteRequest<br/>? PastePayload<br/>? PasteMeta"]
        
        Storage["?? Storage.kt<br/>(Component)<br/>? PasteRepo class<br/>? Database schema<br/>? CRUD operations"]
        
        Pow["?? Pow.kt<br/>(Component)<br/>? PowService<br/>? Challenge generation<br/>? Solution verification"]
        
        RateLimiter["?? RateLimiter.kt<br/>(Component)<br/>? TokenBucket<br/>? Rate limiting logic"]
        
        Utils["??? Utils.kt<br/>(Component)<br/>? ID generation<br/>? Base64 utilities"]
    end
    
    DB[("?? SQLite Database<br/>(External)")]
    
    App -->|initializes| Routes
    App -->|creates| Storage
    App -->|creates| Pow
    App -->|creates| RateLimiter
    
    Routes -->|uses| Models
    Routes -->|uses| Storage
    Routes -->|uses| Pow
    Routes -->|uses| RateLimiter
    Routes -->|uses| Utils
    
    Storage -->|reads/writes| DB
    
    style App fill:#ff6b6b,stroke:#c92a2a,color:#ffffff
    style Routes fill:#ff6b6b,stroke:#c92a2a,color:#ffffff
    style Storage fill:#ff6b6b,stroke:#c92a2a,color:#ffffff
```

**Problems with Current State:**

- ? No clear layering (domain vs infrastructure)
- ? Hard to swap implementations (e.g., MongoDB instead of SQLite)
- ? Routes contain business logic
- ? Tight coupling to Exposed SQL library

---

## Level 3: Component Diagram - Backend (Target Hexagonal Architecture)

Shows the **target** backend architecture using Hexagonal/Ports & Adapters pattern.

```mermaid
graph TB
    subgraph "API Application Container"
        subgraph "Presentation Layer (HTTP)"
            Routes["?? Route Handlers<br/>(Component)<br/>? PasteRoutes<br/>? PowRoutes<br/>? HealthRoutes"]
            Middleware["?? Middleware<br/>(Component)<br/>? Rate limiting<br/>? Security headers<br/>? Error handling"]
        end
        
        subgraph "Application Layer"
            UseCases["?? Use Cases<br/>(Component)<br/>? CreatePasteUseCase<br/>? RetrievePasteUseCase<br/>? DeletePasteUseCase"]
            DTOs["?? DTOs<br/>(Component)<br/>? Request/Response<br/>objects"]
        end
        
        subgraph "Core Domain Layer (Ports)"
            DomainModels["?? Domain Models<br/>(Component)<br/>? Paste<br/>? PasteMeta"]
            Validators["? Validators<br/>(Component)<br/>? Business rules<br/>? Constraints"]
            Ports["?? Port Interfaces<br/>(Component)<br/>? PasteRepository<br/>? RateLimiter<br/>? PowVerifier<br/>? IdGenerator"]
            Exceptions["?? Domain Exceptions<br/>(Component)<br/>? Business errors"]
        end
        
        subgraph "Infrastructure Layer (Adapters)"
            RepoAdapter["?? Repository Adapter<br/>(Component)<br/>ExposedPasteRepository<br/>(implements PasteRepository)"]
            RLAdapter["?? Rate Limiter Adapter<br/>(Component)<br/>TokenBucketRateLimiter<br/>(implements RateLimiter)"]
            PowAdapter["?? PoW Adapter<br/>(Component)<br/>Sha256PowVerifier<br/>(implements PowVerifier)"]
        end
        
        DI["?? DI Module (Koin)<br/>(Component)<br/>Dependency injection"]
    end
    
    DB[("?? Database<br/>(External)<br/>SQLite / PostgreSQL /<br/>MongoDB")]
    
    Redis[("?? Redis<br/>(External)<br/>Optional caching")]
    
    %% Presentation to Application
    Routes -->|calls| UseCases
    Routes -->|uses| DTOs
    Middleware -->|intercepts| Routes
    
    %% Application to Domain
    UseCases -->|uses| DomainModels
    UseCases -->|uses| Validators
    UseCases -->|depends on| Ports
    UseCases -->|throws| Exceptions
    
    %% Infrastructure implements Domain
    RepoAdapter -.->|implements| Ports
    RLAdapter -.->|implements| Ports
    PowAdapter -.->|implements| Ports
    
    %% Infrastructure to external
    RepoAdapter -->|SQL queries| DB
    RLAdapter -.->|optional| Redis
    
    %% DI wiring
    DI -->|injects| Routes
    DI -->|provides| UseCases
    DI -->|provides| RepoAdapter
    DI -->|provides| RLAdapter
    DI -->|provides| PowAdapter
    
    style Routes fill:#51cf66,stroke:#2f9e44,color:#ffffff
    style Middleware fill:#51cf66,stroke:#2f9e44,color:#ffffff
    style UseCases fill:#4dabf7,stroke:#1c7ed6,color:#ffffff
    style DTOs fill:#4dabf7,stroke:#1c7ed6,color:#ffffff
    style DomainModels fill:#ffd43b,stroke:#fab005,color:#000000
    style Validators fill:#ffd43b,stroke:#fab005,color:#000000
    style Ports fill:#ffd43b,stroke:#fab005,color:#000000
    style Exceptions fill:#ffd43b,stroke:#fab005,color:#000000
    style RepoAdapter fill:#ff8787,stroke:#fa5252,color:#ffffff
    style RLAdapter fill:#ff8787,stroke:#fa5252,color:#ffffff
    style PowAdapter fill:#ff8787,stroke:#fa5252,color:#ffffff
    style DI fill:#9775fa,stroke:#7950f2,color:#ffffff
```

**Benefits of Target Architecture:**

- ? Hexagonal/Ports & Adapters architecture
- ? Easy to swap storage (implement `PasteRepository`)
- ? Easy to test (mock ports)
- ? Clean separation of concerns
- ? Business logic independent of framework

**Extension Points:**

- Implement `PasteRepository` for different databases (MongoDB, Redis, S3)
- Implement `RateLimiter` for distributed rate limiting
- Implement `PowVerifier` for alternative PoW algorithms

---

## Level 4: Code Diagram - Crypto Module (PR #1)

Shows the actual code-level structure of the crypto module.

```mermaid
classDiagram
    class ICryptoProvider {
        <<interface>>
        +encrypt(plaintext: string) Promise~EncryptionResult~
        +decrypt(input: DecryptionInput) Promise~string~
        +encryptWithPassword(plaintext: string, password: string) Promise~EncryptionResult~
        +decryptWithPassword(input: DecryptionInput, password: string) Promise~string~
        +generateKey() Promise~CryptoKey~
        +generateIV() Uint8Array
    }
    
    class EncryptionResult {
        +ciphertext: string
        +key: string
        +iv: string
        +algorithm: string
    }
    
    class DecryptionInput {
        +ciphertext: string
        +key: string
        +iv: string
        +algorithm?: string
    }
    
    class AesGcmCryptoProvider {
        -algorithm: string = "AES-GCM"
        -keyLength: number = 256
        -ivLength: number = 12
        -pbkdf2Iterations: number = 100000
        +encrypt(plaintext: string) Promise~EncryptionResult~
        +decrypt(input: DecryptionInput) Promise~string~
        +encryptWithPassword(plaintext: string, password: string) Promise~EncryptionResult~
        +decryptWithPassword(input: DecryptionInput, password: string) Promise~string~
        +generateKey() Promise~CryptoKey~
        +generateIV() Uint8Array
        -generateSalt() Uint8Array
        -deriveKeyFromPassword(password: string, salt: Uint8Array) Promise~CryptoKey~
    }
    
    class EncodingUtils {
        <<utility>>
        +encodeBase64Url(bytes: ArrayBuffer) string
        +decodeBase64Url(s: string) ArrayBuffer
    }
    
    class Result~T, E~ {
        <<type>>
        +success: boolean
        +value?: T
        +error?: E
    }
    
    ICryptoProvider <|.. AesGcmCryptoProvider : implements
    ICryptoProvider ..> EncryptionResult : returns
    ICryptoProvider ..> DecryptionInput : accepts
    AesGcmCryptoProvider ..> EncodingUtils : uses
    AesGcmCryptoProvider ..> Result : returns
    
    note for AesGcmCryptoProvider "Uses Web Crypto API\nAES-GCM 256-bit\nPBKDF2 100k iterations"
```

**Design Patterns:**

- **Strategy Pattern**: `ICryptoProvider` allows swapping algorithms
- **Factory Pattern**: `createCryptoProvider()` creates instances
- **Result Type**: Type-safe error handling instead of exceptions

---

## Deployment Diagram

Shows how the system is deployed in production.

```mermaid
graph TB
    subgraph "Production Environment"
        subgraph "Docker Host"
            subgraph "Docker Network"
                Ktor["? Ktor Container<br/>Port 8080<br/>? Static frontend serving<br/>? REST API<br/>? PoW verification<br/>? Rate limiting"]

                Postgres[("?? PostgreSQL<br/>Port 5432<br/>Stores encrypted pastes")]

                Volume[("?? Docker Volume<br/>Persistent storage<br/>PostgreSQL data")]
            end
        end

        LB["?? Load Balancer / Ingress<br/>(External)<br/>TLS termination"]
    end

    Internet["?? Internet"]

    Internet -->|"HTTPS (443)"| LB
    LB -->|"HTTP (8080)"| Ktor
    Ktor -->|"SQL"| Postgres
    Postgres -->|"Read/Write"| Volume

    style Ktor fill:#4dabf7,stroke:#1c7ed6,color:#ffffff
    style Postgres fill:#51cf66,stroke:#2f9e44,color:#ffffff
    style Volume fill:#ffd43b,stroke:#fab005,color:#000000
    style LB fill:#9775fa,stroke:#7950f2,color:#ffffff
```

**Deployment Configuration:**

- **Development**: `docker-compose.yml` (port 8080, HTTP) — single Ktor server + PostgreSQL
- **Production**: `docker-compose.prod.yml` (port 8080 behind TLS proxy)
- **Kubernetes**: Ingress terminates TLS, routes to `delerium-server:8080`

---

## Data Flow Diagram - Creating a Paste

Shows the complete flow when a user creates a paste.

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant Crypto as Web Crypto API
    participant PoW as PoW Solver
    participant UI as Frontend UI
    participant API as Ktor API
    participant DB as Database

    User->>Browser: Enters paste content + settings
    User->>UI: Clicks "Save"

    activate UI
    UI->>UI: Validate content size, expiration

    UI->>Crypto: Generate random key & IV
    Crypto-->>UI: Returns key & IV

    UI->>Crypto: Encrypt(content, key, IV)
    Note over Crypto: AES-GCM 256-bit encryption
    Crypto-->>UI: Returns ciphertext

    UI->>API: GET /api/pow
    API-->>UI: Returns PoW challenge

    UI->>PoW: Solve challenge in WebWorker
    Note over PoW: Find nonce with N leading zero bits
    PoW-->>UI: Returns solution nonce

    UI->>API: POST /api/pastes<br/>{ct, iv, meta, pow}

    activate API
    API->>API: Verify PoW solution
    API->>API: Check rate limit
    API->>API: Validate request
    API->>API: Generate paste ID & delete token
    API->>DB: INSERT encrypted paste
    DB-->>API: Success
    API-->>UI: {id, deleteToken}
    deactivate API
    
    UI->>UI: Build share URL:<br/>domain.com/view?p=ID#key:iv
    Note over UI: Key & IV in fragment<br/>(never sent to server)
    
    UI-->>User: Display share URL & delete URL
    deactivate UI
    
    Note over User,DB: Server never sees:<br/>? Plaintext content<br/>? Encryption key<br/>? User can't decrypt without key
```

**Security Properties:**

1. **Zero-knowledge**: Server never sees plaintext
2. **Client-side encryption**: All crypto in browser
3. **Key in fragment**: Encryption key never sent to server
4. **PoW spam protection**: Prevents abuse
5. **Rate limiting**: Additional abuse protection

---

## C4 Model Summary

| Level | Name | Audience | Description |
|-------|------|----------|-------------|
| 1 | System Context | Everyone | Delirium in context of users and external systems |
| 2 | Container | Technical people | High-level tech choices (Ktor, PostgreSQL) |
| 3 | Component | Developers | Internal structure of containers |
| 4 | Code | Developers | Class-level design of specific modules |

**Additional Diagrams:**

- **Deployment**: How system is deployed (Docker)
- **Data Flow**: Sequence of operations for paste creation

---

## Legend

### C4 Model Colors

- ?? **Blue** (#1168bd): Software systems and containers
- ?? **Green** (#51cf66): Presentation layer components
- ?? **Light Blue** (#4dabf7): Application layer components
- ?? **Yellow** (#ffd43b): Domain/core components
- ?? **Red** (#ff8787): Infrastructure components
- ?? **Purple** (#9775fa): Cross-cutting concerns (DI, config)

### Diagram Types

- **Solid lines** (?): Direct dependencies
- **Dashed lines** (-.->): Implements interface
- **Boxes**: Components or containers
- **Cylinders**: Databases
- **People icons**: Actors/users

---

## Next Steps

After all 13 PRs are merged, the architecture will transform from the "Current State" monolithic design to the "Target Architecture" modular design.

**See**: `REFACTORING-PLAN.md` for the complete migration strategy.
