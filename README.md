# Agent de synchronisation Sage-Laravel

Ce projet est un agent de synchronisation qui transfère les données des clients et des factures de Sage Compta (SQL Server) vers une application Laravel (MySQL). Il s'exécute sur la machine où Sage est installé ou sur le même réseau local.

## Fonctionnalités

- Connexion à SQL Server pour lire les données des tables tampon Sage
- Envoi des données via HTTPS à une API Laravel
- Gestion automatique des erreurs et des reconnexions
- Journalisation complète des activités
- Configuration personnalisable
- Exécution en continu avec intervalle configurable

## Prérequis

- Node.js 14+ installé sur le serveur/PC où Sage Compta est installé
- Accès à la base SQL Server de Sage Compta
- URL et clé API de l'application Laravel
- Tables tampon anonymisées dans SQL Server (`anonymes_customers`, `anonymes_invoices`, `anonymes_due_dates`)

## Installation

1. Clonez ou téléchargez ce dépôt sur le serveur où Sage Compta est installé.
2. Installez les dépendances :

```bash
npm install
```

3. Copiez et modifiez le fichier de configuration :

```bash
cp config.json.example config.json
```

4. Modifiez le fichier `config.json` avec vos paramètres :
   - Informations de connexion SQL Server
   - URL et clé API de votre application Laravel
   - Paramètres de synchronisation

## Structure des tables SQL Server

Pour fonctionner correctement, l'agent s'attend à trouver les tables suivantes dans votre base SQL Server :

### Table `anonymes_customers`

Cette table doit contenir les informations des clients à synchroniser.

```sql
CREATE TABLE anonymes_customers (
    id INT PRIMARY KEY,
    sage_id NVARCHAR(50) NOT NULL,
    code NVARCHAR(50) NULL,
    company_name NVARCHAR(255) NULL,
    contact_name NVARCHAR(255) NULL,
    email NVARCHAR(255) NULL,
    phone NVARCHAR(50) NULL,
    address NVARCHAR(MAX) NULL,
    payment_delay INT NULL,
    currency NVARCHAR(3) NULL,
    credit_limit DECIMAL(15, 2) NULL,
    max_days_overdue INT NULL,
    risk_level NVARCHAR(50) NULL,
    notes NVARCHAR(MAX) NULL,
    is_active BIT NULL,
    synced BIT DEFAULT 0,
    sync_date DATETIME NULL
);
```

### Table `anonymes_invoices`

Cette table doit contenir les informations des factures à synchroniser.

```sql
CREATE TABLE anonymes_invoices (
    id INT PRIMARY KEY,
    sage_id NVARCHAR(50) NOT NULL,
    invoice_number NVARCHAR(50) NOT NULL,
    customer_sage_id NVARCHAR(50) NOT NULL,
    reference NVARCHAR(100) NULL,
    type NVARCHAR(50) NULL,
    invoice_date DATE NOT NULL,
    currency NVARCHAR(3) NULL,
    total_amount DECIMAL(15, 2) NOT NULL,
    notes NVARCHAR(MAX) NULL,
    created_by NVARCHAR(100) NULL,
    synced BIT DEFAULT 0,
    sync_date DATETIME NULL
);
```

### Table `anonymes_due_dates`

Cette table doit contenir les échéances des factures à synchroniser.

```sql
CREATE TABLE anonymes_due_dates (
    id INT PRIMARY KEY,
    invoice_id INT NOT NULL,
    due_date DATE NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    synced BIT DEFAULT 0,
    sync_date DATETIME NULL,
    FOREIGN KEY (invoice_id) REFERENCES anonymes_invoices(id)
);
```

## Utilisation

### Démarrage manuel

```bash
npm start
```

### Configuration comme service Windows

Pour exécuter l'agent comme un service Windows, vous pouvez utiliser [node-windows](https://github.com/coreybutler/node-windows) ou [nssm](https://nssm.cc/).

#### Avec node-windows

1. Installez node-windows :

```bash
npm install -g node-windows
npm link node-windows
```

2. Créez un fichier `install-service.js` :

```javascript
const Service = require("node-windows").Service;

const svc = new Service({
  name: "SageLaravelSyncAgent",
  description: "Agent de synchronisation Sage-Laravel",
  script: require("path").join(__dirname, "index.js"),
});

svc.on("install", function () {
  svc.start();
  console.log("Service installé et démarré");
});

svc.install();
```

3. Exécutez le script d'installation :

```bash
node install-service.js
```

#### Avec NSSM

1. Téléchargez et installez [NSSM](https://nssm.cc/)
2. Ouvrez une invite de commande en tant qu'administrateur
3. Exécutez :

```bash
nssm install SageLaravelSyncAgent "C:\Program Files\nodejs\node.exe" "C:\chemin\vers\votre\projet\index.js"
nssm set SageLaravelSyncAgent AppDirectory "C:\chemin\vers\votre\projet"
nssm set SageLaravelSyncAgent Description "Agent de synchronisation Sage-Laravel"
nssm start SageLaravelSyncAgent
```

## Configuration

Le fichier `config.json` contient les paramètres suivants :

### Section database

```json
"database": {
  "server": "localhost\\SQLEXPRESS",
  "database": "SAGE_COMPTA",
  "user": "sa",
  "password": "VotreMotDePasse",
  "options": {
    "trustServerCertificate": true,
    "encrypt": false,
    "enableArithAbort": true
  }
}
```

- `server` : Nom du serveur SQL Server (généralement `localhost\SQLEXPRESS` pour une installation locale)
- `database` : Nom de la base de données Sage
- `user` : Nom d'utilisateur SQL Server
- `password` : Mot de passe
- `options` : Options de connexion SQL Server

### Section api

```json
"api": {
  "url": "https://votre-app.laravel.com/api/sage",
  "key": "votre_cle_api_secrete"
}
```

- `url` : URL de l'API Laravel (sans slash final)
- `key` : Clé API pour l'authentification

### Section sync

```json
"sync": {
  "interval": 300,
  "batchSize": 50,
  "deleteAfterSync": false
}
```

- `interval` : Intervalle entre chaque cycle de synchronisation (en secondes)
- `batchSize` : Nombre maximum d'enregistrements à traiter par lot
- `deleteAfterSync` : Si `true`, les enregistrements sont supprimés après synchronisation; si `false`, ils sont marqués comme synchronisés

## Journalisation

Les logs sont stockés dans le dossier `logs/sync-agent.log`. Ils contiennent des informations détaillées sur chaque cycle de synchronisation, y compris les erreurs éventuelles.

## Dépannage

### Problèmes de connexion SQL Server

- Vérifiez que SQL Server Express est en cours d'exécution
- Vérifiez que l'authentification SQL Server est activée
- Vérifiez que l'utilisateur a les permissions nécessaires
- Activez les logs TCP/IP dans SQL Server Configuration Manager

### Problèmes de connexion API

- Vérifiez que l'URL de l'API est correcte et accessible
- Vérifiez que la clé API est valide
- Vérifiez que le serveur Laravel est en cours d'exécution
- Vérifiez les logs Laravel pour les erreurs côté serveur

## Licence

ISC
