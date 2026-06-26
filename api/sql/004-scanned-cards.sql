USE CardShop;
GO

IF OBJECT_ID('dbo.ScannedCards', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ScannedCards (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        UserId INT NOT NULL,
        CardApiId NVARCHAR(100) NULL,
        CardName NVARCHAR(255) NOT NULL,
        CardSet NVARCHAR(255) NULL,
        CardNumber NVARCHAR(50) NULL,
        ImageUrl NVARCHAR(500) NULL,
        MarketPrice DECIMAL(10,2) NULL,
        ShopPrice DECIMAL(10,2) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT CONVERT(datetime2, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time'),
        CONSTRAINT FK_ScannedCards_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ScannedCards_UserId_CreatedAt')
BEGIN
    CREATE INDEX IX_ScannedCards_UserId_CreatedAt ON dbo.ScannedCards (UserId, CreatedAt DESC);
END;
GO
