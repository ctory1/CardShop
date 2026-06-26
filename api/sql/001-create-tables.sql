/*
 * CardShop
 * Copyright © 2026 Colin Toryfter
 * All Rights Reserved.
 *
 * Unauthorized copying or distribution of this file is prohibited.
 */

USE CardShop;
GO

IF OBJECT_ID('dbo.Users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Username NVARCHAR(50) NOT NULL UNIQUE,
        Email NVARCHAR(255) NOT NULL UNIQUE,
        PasswordHash NVARCHAR(MAX) NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT CONVERT(datetime2, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time')
    );
END;

IF OBJECT_ID('dbo.UserSessions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserSessions (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        UserId INT NOT NULL,
        TokenHash CHAR(64) NOT NULL UNIQUE,
        CreatedAt DATETIME2 NOT NULL DEFAULT CONVERT(datetime2, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time'),
        ExpiresAt DATETIME2 NOT NULL,
        CONSTRAINT FK_UserSessions_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id) ON DELETE CASCADE
    );
END;

IF OBJECT_ID('dbo.PasswordResetTokens', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PasswordResetTokens (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        UserId INT NOT NULL,
        TokenHash CHAR(64) NOT NULL UNIQUE,
        CreatedAt DATETIME2 NOT NULL DEFAULT CONVERT(datetime2, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time'),
        ExpiresAt DATETIME2 NOT NULL,
        UsedAt DATETIME2 NULL,
        CONSTRAINT FK_PasswordResetTokens_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id) ON DELETE CASCADE
    );
END;

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

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UserSessions_TokenHash')
BEGIN
    CREATE INDEX IX_UserSessions_TokenHash ON dbo.UserSessions (TokenHash);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PasswordResetTokens_TokenHash')
BEGIN
    CREATE INDEX IX_PasswordResetTokens_TokenHash ON dbo.PasswordResetTokens (TokenHash);
END;
GO
