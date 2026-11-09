# Database Setup & Startup Instructions

This document provides complete instructions for starting and managing the local database instances (MySQL 8 and MongoDB Community) required by the **Campus Resource Booking & Waitlist Management System**.

---

## 1. Prerequisites Check

Verify your installations:

```bash
# Check MySQL
mysql --version

# Check MongoDB
mongod --version

# Check Node.js and npm
node -v
npm -v
```

---

## 2. MySQL 8 (Relational Storage)

The application uses **MySQL 8** for transactional resource booking, relational entities, ACID compliance, stored procedures, triggers, and views.

### Starting MySQL on macOS (Homebrew)
```bash
brew services start mysql
```

### Stopping / Restarting MySQL
```bash
brew services restart mysql
brew services stop mysql
```

### Initial Database Setup
Connect to MySQL and create the `campus_reserve` database:
```bash
mysql -u root -p
```
Run SQL:
```sql
CREATE DATABASE IF NOT EXISTS campus_reserve;
SHOW DATABASES;
```

---

## 3. MongoDB Community (NoSQL Audit & Logs)

The application uses **MongoDB** for immutable activity logging, cancellation logs, and administrative audit streams.

### Starting MongoDB on macOS (Homebrew)
```bash
brew services start mongodb-community
```

### Stopping / Restarting MongoDB
```bash
brew services restart mongodb-community
brew services stop mongodb-community
```

MongoDB listens on `127.0.0.1:27017` by default. The database `campus_reserve_logs` is created lazily upon first document insertion.

---

## 4. Optional Docker Compose Alternative

If you ever run this project in an environment without native Homebrew services, you can run both services via Docker Compose:

Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    container_name: campus_mysql
    environment:
      MYSQL_ROOT_PASSWORD: ""
      MYSQL_ALLOW_EMPTY_PASSWORD: "yes"
      MYSQL_DATABASE: campus_reserve
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql

  mongodb:
    image: mongo:7.0
    container_name: campus_mongo
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

volumes:
  mysql_data:
  mongo_data:
```

Start the containers:
```bash
docker compose up -d
```

---

## 5. Next.js Application Environment Configuration

Copy the sample environment variables:
```bash
cp .env.example .env.local
```

Ensure your `.env.local` contains:
```env
PORT=3000
NODE_ENV=development

# MySQL 8 Configuration
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=campus_reserve
MYSQL_CONNECTION_LIMIT=10

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/campus_reserve_logs
MONGODB_DB_NAME=campus_reserve_logs

# JWT Authentication Secret
JWT_SECRET=campus_reserve_secret_jwt_key_development_32chars!
JWT_EXPIRES_IN=24h
```

---

## 6. Connectivity Verification Endpoints

Start the development server:
```bash
npm run dev
```

Visit the built-in health probe routes:
- **Overall System**: `http://localhost:3000/api/health`
- **MySQL 8 Health**: `http://localhost:3000/api/health/mysql`
- **MongoDB Health**: `http://localhost:3000/api/health/mongodb`
