-- =====================================================
-- CRÉER UN NOUVEL UTILISATEUR SQL SERVER
-- =====================================================

-- 1. Créer un login au niveau du serveur
CREATE LOGIN [sync_user] 
WITH PASSWORD = 'VotreMotDePasse123!',
     DEFAULT_DATABASE = [SK DISTRIBUTION ELACTRON],
     CHECK_EXPIRATION = OFF,
     CHECK_POLICY = OFF;

-- 2. Créer un utilisateur dans la base de données spécifique
USE [SK DISTRIBUTION ELACTRON];
GO

CREATE USER [sync_user] FOR LOGIN [sync_user];

-- 3. Accorder les permissions nécessaires
-- Option A: Permissions spécifiques (recommandé)
GRANT SELECT, INSERT, UPDATE, DELETE ON [anonymes_customers] TO [sync_user];
GRANT SELECT, INSERT, UPDATE, DELETE ON [anonymes_invoices] TO [sync_user];
GRANT SELECT, INSERT, UPDATE, DELETE ON [anonymes_due_dates] TO [sync_user];

-- Option B: Permissions de lecture/écriture sur toute la base (plus large)
-- ALTER ROLE [db_datareader] ADD MEMBER [sync_user];
-- ALTER ROLE [db_datawriter] ADD MEMBER [sync_user];

-- Option C: Permissions d'administrateur de base (le plus large - à éviter en production)
-- ALTER ROLE [db_owner] ADD MEMBER [sync_user];

-- =====================================================
-- VÉRIFICATIONS
-- =====================================================

-- Vérifier que le login a été créé
SELECT name, type_desc, is_disabled, create_date 
FROM sys.server_principals 
WHERE name = 'sync_user';

-- Vérifier que l'utilisateur a été créé dans la base
SELECT name, type_desc, create_date 
FROM sys.database_principals 
WHERE name = 'sync_user';

-- Vérifier les permissions accordées
SELECT 
    p.permission_name,
    p.state_desc,
    o.name AS object_name
FROM sys.database_permissions p
JOIN sys.objects o ON p.major_id = o.object_id
JOIN sys.database_principals dp ON p.grantee_principal_id = dp.principal_id
WHERE dp.name = 'sync_user';

-- =====================================================
-- COMMANDES UTILES POUR LA GESTION
-- =====================================================

-- Supprimer l'utilisateur (si besoin)
-- DROP USER [sync_user];

-- Supprimer le login (si besoin)
-- DROP LOGIN [sync_user];

-- Changer le mot de passe
-- ALTER LOGIN [sync_user] WITH PASSWORD = 'NouveauMotDePasse123!';

-- Désactiver le login
-- ALTER LOGIN [sync_user] DISABLE;

-- Réactiver le login
-- ALTER LOGIN [sync_user] ENABLE;