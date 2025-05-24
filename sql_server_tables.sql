-- Script SQL pour créer les tables tampon nécessaires à la synchronisation
-- À exécuter dans la base de données SQL Server où se trouve Sage Compta

-- Table tampon pour les clients
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[anonymes_customers]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[anonymes_customers](
        [id] [int] IDENTITY(1,1) NOT NULL,
        [sage_id] [nvarchar](50) NOT NULL,
        [code] [nvarchar](50) NULL,
        [company_name] [nvarchar](255) NULL,
        [contact_name] [nvarchar](255) NULL,
        [email] [nvarchar](255) NULL,
        [phone] [nvarchar](50) NULL,
        [address] [nvarchar](max) NULL,
        [payment_delay] [int] NULL,
        [currency] [nvarchar](3) NULL,
        [credit_limit] [decimal](15, 2) NULL,
        [max_days_overdue] [int] NULL,
        [risk_level] [nvarchar](50) NULL,
        [notes] [nvarchar](max) NULL,
        [is_active] [bit] NULL,
        [synced] [bit] DEFAULT 0,
        [sync_date] [datetime] NULL,
        CONSTRAINT [PK_anonymes_customers] PRIMARY KEY CLUSTERED ([id] ASC)
    );

PRINT 'Table anonymes_customers créée avec succès';

END ELSE BEGIN PRINT 'Table anonymes_customers déjà existante';

END

-- Table tampon pour les factures
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[anonymes_invoices]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[anonymes_invoices](
        [id] [int] IDENTITY(1,1) NOT NULL,
        [sage_id] [nvarchar](50) NOT NULL,
        [invoice_number] [nvarchar](50) NOT NULL,
        [customer_sage_id] [nvarchar](50) NOT NULL,
        [reference] [nvarchar](100) NULL,
        [type] [nvarchar](50) NULL,
        [invoice_date] [date] NOT NULL,
        [currency] [nvarchar](3) NULL,
        [total_amount] [decimal](15, 2) NOT NULL,
        [notes] [nvarchar](max) NULL,
        [created_by] [nvarchar](100) NULL,
        [synced] [bit] DEFAULT 0,
        [sync_date] [datetime] NULL,
        CONSTRAINT [PK_anonymes_invoices] PRIMARY KEY CLUSTERED ([id] ASC)
    );

PRINT 'Table anonymes_invoices créée avec succès';

END ELSE BEGIN PRINT 'Table anonymes_invoices déjà existante';

END

-- Table tampon pour les échéances de factures
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[anonymes_due_dates]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[anonymes_due_dates](
        [id] [int] IDENTITY(1,1) NOT NULL,
        [invoice_id] [int] NOT NULL,
        [due_date] [date] NOT NULL,
        [amount] [decimal](15, 2) NOT NULL,
        [synced] [bit] DEFAULT 0,
        [sync_date] [datetime] NULL,
        CONSTRAINT [PK_anonymes_due_dates] PRIMARY KEY CLUSTERED ([id] ASC),
        CONSTRAINT [FK_anonymes_due_dates_anonymes_invoices] FOREIGN KEY ([invoice_id]) 
            REFERENCES [dbo].[anonymes_invoices] ([id]) ON DELETE CASCADE
    );

PRINT 'Table anonymes_due_dates créée avec succès';

END ELSE BEGIN PRINT 'Table anonymes_due_dates déjà existante';

END

-- Créer les index pour améliorer les performances
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_anonymes_customers_synced' AND object_id = OBJECT_ID('anonymes_customers'))
BEGIN
    CREATE INDEX [IX_anonymes_customers_synced] ON [dbo].[anonymes_customers] ([synced]);

PRINT 'Index IX_anonymes_customers_synced créé avec succès';


END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_anonymes_customers_sage_id' AND object_id = OBJECT_ID('anonymes_customers'))
BEGIN
    CREATE INDEX [IX_anonymes_customers_sage_id] ON [dbo].[anonymes_customers] ([sage_id]);

PRINT 'Index IX_anonymes_customers_sage_id créé avec succès';


END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_anonymes_invoices_synced' AND object_id = OBJECT_ID('anonymes_invoices'))
BEGIN
    CREATE INDEX [IX_anonymes_invoices_synced] ON [dbo].[anonymes_invoices] ([synced]);

PRINT 'Index IX_anonymes_invoices_synced créé avec succès';


END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_anonymes_invoices_sage_id' AND object_id = OBJECT_ID('anonymes_invoices'))
BEGIN
    CREATE INDEX [IX_anonymes_invoices_sage_id] ON [dbo].[anonymes_invoices] ([sage_id]);

PRINT 'Index IX_anonymes_invoices_sage_id créé avec succès';


END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_anonymes_invoices_customer_sage_id' AND object_id = OBJECT_ID('anonymes_invoices'))
BEGIN
    CREATE INDEX [IX_anonymes_invoices_customer_sage_id] ON [dbo].[anonymes_invoices] ([customer_sage_id]);

PRINT 'Index IX_anonymes_invoices_customer_sage_id créé avec succès';

END

PRINT 'Configuration des tables tampon terminée';