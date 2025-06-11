-- Supprimer les tables existantes
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[anonymes_due_dates]') AND type in (N'U'))
    DROP TABLE [dbo].[anonymes_due_dates];

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[anonymes_invoices]') AND type in (N'U'))
    DROP TABLE [dbo].[anonymes_invoices];

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[anonymes_customers]') AND type in (N'U'))
    DROP TABLE [dbo].[anonymes_customers];

-- Table des clients
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

-- Table des factures
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

-- Table des échéances
CREATE TABLE [dbo].[anonymes_due_dates](
    [id] [int] IDENTITY(1,1) NOT NULL,
    [invoice_sage_id] [nvarchar](50) NOT NULL,
    [customer_sage_id] [nvarchar](50) NOT NULL,
    [sage_ecriture_id] [int] NOT NULL,
    [due_date] [date] NOT NULL,
    [amount] [decimal](15, 2) NOT NULL,
    [status_regle] [int] DEFAULT 0,
    [montant_regle] [decimal](15, 2) DEFAULT 0,
    [date_regle] [date] NULL,
    [reference] [nvarchar](100) NULL,
    [synced] [bit] DEFAULT 0,
    [sync_date] [datetime] NULL,
    CONSTRAINT [PK_anonymes_due_dates] PRIMARY KEY CLUSTERED ([id] ASC)
);

-- Index pour les performances
CREATE INDEX [IX_anonymes_customers_synced] ON [dbo].[anonymes_customers] ([synced]);
CREATE INDEX [IX_anonymes_customers_sage_id] ON [dbo].[anonymes_customers] ([sage_id]);
CREATE INDEX [IX_anonymes_invoices_synced] ON [dbo].[anonymes_invoices] ([synced]);
CREATE INDEX [IX_anonymes_invoices_sage_id] ON [dbo].[anonymes_invoices] ([sage_id]);
CREATE INDEX [IX_anonymes_invoices_customer_sage_id] ON [dbo].[anonymes_invoices] ([customer_sage_id]);
CREATE INDEX [IX_anonymes_due_dates_synced] ON [dbo].[anonymes_due_dates] ([synced]);
CREATE INDEX [IX_anonymes_due_dates_invoice_sage_id] ON [dbo].[anonymes_due_dates] ([invoice_sage_id]);
CREATE INDEX [IX_anonymes_due_dates_customer_sage_id] ON [dbo].[anonymes_due_dates] ([customer_sage_id]);
CREATE INDEX [IX_anonymes_due_dates_sage_ecriture_id] ON [dbo].[anonymes_due_dates] ([sage_ecriture_id]);