/*
 * CardShop
 * Copyright © 2026 Colin Toryfter
 * All Rights Reserved.
 *
 * Unauthorized copying or distribution of this file is prohibited.
 */

USE CardShop;
GO

IF OBJECT_ID('dbo.PokemonStock', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PokemonStock (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        CardApiId NVARCHAR(100) NOT NULL,
        CardName NVARCHAR(255) NOT NULL,
        CardSet NVARCHAR(255) NOT NULL,
        CardNumber NVARCHAR(50) NULL,
        ImageUrl NVARCHAR(500) NULL,
        FrontImageUrl NVARCHAR(MAX) NULL,
        BackImageUrl NVARCHAR(MAX) NULL,
        MarketPrice DECIMAL(10,2) NULL,
        Condition NVARCHAR(40) NOT NULL,
        Quantity INT NOT NULL DEFAULT 1,
        SortOrder INT NOT NULL DEFAULT 0,
        CreatedAt DATETIME2 NOT NULL DEFAULT CONVERT(datetime2, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time')
    );
END;

IF COL_LENGTH('dbo.PokemonStock', 'FrontImageUrl') IS NULL
BEGIN
    ALTER TABLE dbo.PokemonStock ADD FrontImageUrl NVARCHAR(MAX) NULL;
END;

IF COL_LENGTH('dbo.PokemonStock', 'BackImageUrl') IS NULL
BEGIN
    ALTER TABLE dbo.PokemonStock ADD BackImageUrl NVARCHAR(MAX) NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PokemonStock_SortOrder_CreatedAt')
BEGIN
    CREATE INDEX IX_PokemonStock_SortOrder_CreatedAt ON dbo.PokemonStock (SortOrder ASC, CreatedAt DESC);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PokemonStock_CardApiId')
BEGIN
    CREATE INDEX IX_PokemonStock_CardApiId ON dbo.PokemonStock (CardApiId);
END;
GO
