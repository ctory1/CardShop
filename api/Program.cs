/*
 * CardShop
 * Copyright © 2026 Colin Toryfter
 * All Rights Reserved.
 *
 * Unauthorized copying or distribution of this file is prohibited.
 */

using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using CardShop.Api;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using System.Net;
using System.Net.Mail;

var builder = WebApplication.CreateBuilder(args);

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins")
    .GetChildren()
    .Select(origin => origin.Value)
    .Where(origin => !string.IsNullOrWhiteSpace(origin))
    .Cast<string>()
    .ToArray();

if (allowedOrigins.Length == 0)
{
    allowedOrigins = [
        "http://localhost:8000",
        "http://127.0.0.1:5500", 
        "https://ctory1.github.io"
    ];
}

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod());
});

builder.Services.AddSingleton<PasswordHasher<AppUser>>();
builder.Services.AddSingleton<Database>();
builder.Services.AddSingleton<EmailSender>();
builder.Services.AddHttpClient<StockPriceService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(8);
});
builder.Services.AddHttpContextAccessor();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}
app.UseCors();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/api/stock", async (Database db, StockPriceService stockPriceService) =>
{
    try
    {
        var editableStock = await db.GetPokemonStockCardsAsync();
        if (editableStock.Count > 0)
        {
            return Results.Ok(await stockPriceService.GetStockAsync(editableStock));
        }
    }
    catch (SqlException)
    {
        // Keep the public stock page online if the optional stock table has not been created yet.
    }

    return Results.Ok(await stockPriceService.GetDefaultStockAsync());
});

app.MapPost("/api/auth/signup", async (
    SignupRequest request,
    Database db,
    PasswordHasher<AppUser> passwordHasher) =>
{
    var validation = ValidateSignup(request);
    if (validation is not null)
    {
        return validation;
    }

    var trimmedUsername = request.Username.Trim();
    var trimmedEmail = request.Email.Trim().ToLowerInvariant();

    // Check username and email separately so the user knows which field is taken
    var usernameExists = await db.UsernameExistsAsync(trimmedUsername);
    var emailExists = await db.EmailExistsAsync(trimmedEmail);

    if (usernameExists || emailExists)
    {
        var errors = new List<string>();
        var duplicateFields = new List<string>();
        if (usernameExists)
        {
            errors.Add("Username is taken");
            duplicateFields.Add("username");
        }
        if (emailExists)
        {
            errors.Add("Email is taken");
            duplicateFields.Add("email");
        }
        return Results.Conflict(new { message = string.Join(" and ", errors) + ".", duplicateFields });
    }

    var user = new AppUser
    {
        Username = trimmedUsername,
        Email = trimmedEmail,
        PasswordHash = string.Empty
    };
    user.PasswordHash = passwordHasher.HashPassword(user, request.Password);

    var createdUser = await db.CreateUserAsync(user);
    var token = CreateToken();
    await db.CreateSessionAsync(createdUser.Id, HashToken(token));

    return Results.Ok(AuthResponse.FromUser(createdUser, token));
});

app.MapPost("/api/auth/login", async (
    LoginRequest request,
    Database db,
    PasswordHasher<AppUser> passwordHasher) =>
{
    if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
    {
        return Results.BadRequest(new { message = "Email and password are required." });
    }

    var user = await db.GetUserByEmailAsync(request.Email.Trim().ToLowerInvariant());
    if (user is null)
    {
        return Results.NotFound(new { message = "Email not registered." });
    }

    var result = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
    if (result == PasswordVerificationResult.Failed)
    {
        return Results.Json(new { message = "Password is incorrect." }, statusCode: StatusCodes.Status401Unauthorized);
    }

    var token = CreateToken();
    await db.CreateSessionAsync(user.Id, HashToken(token));

    return Results.Ok(AuthResponse.FromUser(user, token));
});

app.MapPost("/api/auth/request-password-reset", async (
    PasswordResetRequest request,
    HttpRequest httpRequest,
    Database db,
    EmailSender emailSender) =>
{
    if (!IsValidEmail(request.Email))
    {
        return Results.BadRequest(new { message = "Enter a valid email address." });
    }

    if (!emailSender.IsConfigured)
    {
        return Results.Json(
            new { message = "Password reset email is not configured on the server." },
            statusCode: StatusCodes.Status500InternalServerError);
    }

    var email = request.Email.Trim().ToLowerInvariant();
    var user = await db.GetUserByEmailAsync(email);
    if (user is null)
    {
        return Results.NotFound(new { message = "Email not registered." });
    }

    var resetToken = CreateToken();
    try
    {
        await db.CreatePasswordResetTokenAsync(user.Id, HashToken(resetToken));
    }
    catch (SqlException)
    {
        return Results.Json(
            new { message = "Password reset storage is not ready. Run api/sql/003-password-reset-tokens.sql, then try again." },
            statusCode: StatusCodes.Status500InternalServerError);
    }

    var resetUrlBase = ResolveResetUrlBase(emailSender.ResetUrlBase, request.ResetUrlBase, httpRequest, allowedOrigins);
    if (resetUrlBase is null)
    {
        return Results.Json(
            new { message = "Password reset URL is not configured correctly on the server." },
            statusCode: StatusCodes.Status500InternalServerError);
    }

    var resetUrl = $"{resetUrlBase}{(resetUrlBase.Contains('?') ? "&" : "?")}resetToken={Uri.EscapeDataString(resetToken)}&email={Uri.EscapeDataString(email)}";

    try
    {
        await emailSender.SendPasswordResetAsync(email, user.Username, resetUrl);
    }
    catch (Exception)
    {
        return Results.Json(
            new { message = "Password reset email could not be sent right now." },
            statusCode: StatusCodes.Status500InternalServerError);
    }

    return Results.Ok(new { message = "Password reset email sent." });
});

app.MapPost("/api/auth/reset-password", async (
    PasswordResetConfirmRequest request,
    Database db,
    PasswordHasher<AppUser> passwordHasher) =>
{
    if (!IsValidEmail(request.Email))
    {
        return Results.BadRequest(new { message = "Enter a valid email address." });
    }

    if (string.IsNullOrWhiteSpace(request.Token))
    {
        return Results.BadRequest(new { message = "Reset token is required." });
    }

    if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
    {
        return Results.BadRequest(new { message = "Password must be at least 8 characters." });
    }

    var email = request.Email.Trim().ToLowerInvariant();
    var user = await db.GetUserByValidPasswordResetTokenAsync(email, HashToken(request.Token));
    if (user is null)
    {
        return Results.BadRequest(new { message = "This reset link is invalid or expired." });
    }

    user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
    await db.UpdatePasswordAsync(user.Id, user.PasswordHash);
    await db.MarkPasswordResetTokenUsedAsync(HashToken(request.Token));
    await db.DeleteSessionsForUserAsync(user.Id);

    return Results.Ok(new { message = "Password updated. You can log in now." });
});

app.MapPost("/api/auth/logout", async (HttpRequest request, Database db) =>
{
    var token = GetBearerToken(request);
    if (token is not null)
    {
        await db.DeleteSessionAsync(HashToken(token));
    }

    return Results.NoContent();
});

app.MapGet("/api/me", async (HttpRequest request, Database db) =>
{
    var user = await GetAuthenticatedUser(request, db);
    return user is null
        ? Results.Unauthorized()
        : Results.Ok(UserDto.FromUser(user));
});

app.MapDelete("/api/me", DeleteAuthenticatedUser);
app.MapPost("/api/auth/delete-account", DeleteAuthenticatedUser);

app.MapGet("/api/cards", async (HttpRequest request, Database db) =>
{
    var user = await GetAuthenticatedUser(request, db);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    return Results.Ok(await db.GetCardsAsync(user.Id));
});

app.MapPost("/api/cards", async (HttpRequest request, SaveCardRequest card, Database db) =>
{
    var user = await GetAuthenticatedUser(request, db);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    if (string.IsNullOrWhiteSpace(card.CardName))
    {
        return Results.BadRequest(new { message = "CardName is required." });
    }

    var savedCard = await db.SaveCardAsync(user.Id, card);
    return Results.Ok(savedCard);
});

app.MapPut("/api/cards/{id:int}/price", async (HttpRequest request, int id, UpdateCardPriceRequest price, Database db) =>
{
    var user = await GetAuthenticatedUser(request, db);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var savedCard = await db.UpdateCardPriceAsync(user.Id, id, price);
    return savedCard is null
        ? Results.NotFound(new { message = "Saved card not found." })
        : Results.Ok(savedCard);
});

app.MapDelete("/api/cards/{id:int}", async (HttpRequest request, int id, Database db) =>
{
    var user = await GetAuthenticatedUser(request, db);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    await db.DeleteCardAsync(user.Id, id);
    return Results.NoContent();
});

app.MapPost("/api/orders/receipt", async (
    HttpRequest httpRequest,
    OrderReceiptRequest order,
    Database db,
    EmailSender emailSender) =>
{
    if (!emailSender.IsConfigured)
    {
        return Results.Json(
            new { message = "Order receipt email is not configured on the server." },
            statusCode: StatusCodes.Status500InternalServerError);
    }

    if (order.Items is null || order.Items.Count == 0)
    {
        return Results.BadRequest(new { message = "At least one order item is required." });
    }

    var user = await GetAuthenticatedUser(httpRequest, db);
    var total = order.Items.Sum(item => Math.Max(0, item.ShopPrice) * Math.Max(0, item.Quantity));
    var receipt = order with
    {
        BuyerUsername = string.IsNullOrWhiteSpace(order.BuyerUsername) ? user?.Username : order.BuyerUsername,
        BuyerEmail = string.IsNullOrWhiteSpace(order.BuyerEmail) ? user?.Email : order.BuyerEmail,
        Total = total
    };

    if (string.IsNullOrWhiteSpace(receipt.BuyerEmail) || !IsValidEmail(receipt.BuyerEmail))
    {
        return Results.BadRequest(new { message = "A valid buyer email is required for the purchase receipt." });
    }

    try
    {
        var stockUpdated = await db.TryApplyPokemonStockPurchaseAsync(receipt.Items);
        if (!stockUpdated)
        {
            return Results.Conflict(new { message = "One or more cards are no longer available in the requested quantity." });
        }
    }
    catch (SqlException)
    {
        return Results.Json(
            new { message = "Stock tracking is not ready on the server." },
            statusCode: StatusCodes.Status500InternalServerError);
    }

    receipt = await SaveOrderReceiptPhotosAsync(httpRequest, receipt);

    var emailSent = true;
    var emailMessage = "Order receipt emails sent.";
    try
    {
        await emailSender.SendOrderReceiptAsync(receipt);
        await emailSender.SendBuyerOrderReceiptAsync(receipt);
    }
    catch (Exception)
    {
        emailSent = false;
        emailMessage = "Order placed and stock updated, but receipt email could not be sent right now.";
    }

    return Results.Ok(new { message = emailMessage, emailSent });
});

app.MapGet("/api/order-photos/{orderId}", (string orderId) =>
{
    var safeOrderId = SafePathSegment(orderId);
    var orderDir = Path.Combine(OrderPhotoRoot(), safeOrderId);
    if (!Directory.Exists(orderDir))
    {
        return Results.NotFound("No saved photos were found for this order.");
    }

    var images = Directory.GetFiles(orderDir)
        .Where(path => IsSupportedImageFile(path))
        .OrderBy(Path.GetFileName)
        .Select(path => $"""
            <figure>
              <img src="{WebUtility.HtmlEncode(Path.GetFileName(path))}" alt="{WebUtility.HtmlEncode(Path.GetFileNameWithoutExtension(path))}">
              <figcaption>{WebUtility.HtmlEncode(Path.GetFileName(path))}</figcaption>
            </figure>
            """);

    return Results.Content($$"""
        <!doctype html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>CardShop Order Photos</title>
          <style>
            body { font-family: Segoe UI, Arial, sans-serif; margin: 0; padding: 24px; background: #f7f5ef; color: #15212b; }
            h1 { margin-top: 0; }
            .grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
            figure { background: white; border: 1px solid #d9d4c8; border-radius: 8px; margin: 0; padding: 14px; }
            img { display: block; max-width: 100%; margin: 0 auto; }
            figcaption { color: #5f6b75; font-weight: 800; margin-top: 10px; text-align: center; }
          </style>
        </head>
        <body>
          <h1>CardShop Order Photos</h1>
          <p>Order {{WebUtility.HtmlEncode(safeOrderId)}}</p>
          <div class="grid">{{string.Join("", images)}}</div>
        </body>
        </html>
        """, "text/html");
});

app.MapGet("/api/order-photos/{orderId}/{fileName}", (string orderId, string fileName) =>
{
    var safeOrderId = SafePathSegment(orderId);
    var safeFileName = SafePathSegment(fileName);
    var path = Path.Combine(OrderPhotoRoot(), safeOrderId, safeFileName);
    if (!System.IO.File.Exists(path) || !IsSupportedImageFile(path))
    {
        return Results.NotFound();
    }

    return Results.File(path, ImageContentType(path));
});

app.Run();

static async Task<OrderReceiptRequest> SaveOrderReceiptPhotosAsync(HttpRequest request, OrderReceiptRequest order)
{
    var safeOrderId = SafePathSegment(order.Id);
    var orderDir = Path.Combine(OrderPhotoRoot(), safeOrderId);
    Directory.CreateDirectory(orderDir);

    var baseUrl = $"{request.Scheme}://{request.Host}";
    var folderUrl = $"{baseUrl}/api/order-photos/{Uri.EscapeDataString(safeOrderId)}";
    var savedItems = new List<OrderReceiptItem>();

    for (var index = 0; index < order.Items.Count; index++)
    {
        var item = order.Items[index];
        var frontUrl = await SaveDataImageAsync(item.FrontImage, orderDir, folderUrl, $"front-{index + 1}");
        var backUrl = await SaveDataImageAsync(item.BackImage, orderDir, folderUrl, $"back-{index + 1}");
        savedItems.Add(item with
        {
            FrontImage = frontUrl ?? item.FrontImage,
            BackImage = backUrl ?? item.BackImage,
            PhotoFolderUrl = folderUrl
        });
    }

    return order with { Items = savedItems };
}

static async Task<string?> SaveDataImageAsync(string? value, string orderDir, string folderUrl, string fileBaseName)
{
    if (string.IsNullOrWhiteSpace(value) || !value.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
    {
        return null;
    }

    var commaIndex = value.IndexOf(',');
    if (commaIndex < 0)
    {
        return null;
    }

    var metadata = value[..commaIndex];
    var extension = metadata.Contains("image/png", StringComparison.OrdinalIgnoreCase) ? ".png" : ".jpg";
    var bytes = Convert.FromBase64String(value[(commaIndex + 1)..]);
    var fileName = $"{SafePathSegment(fileBaseName)}{extension}";
    await System.IO.File.WriteAllBytesAsync(Path.Combine(orderDir, fileName), bytes);
    return $"{folderUrl}/{Uri.EscapeDataString(fileName)}";
}

static string OrderPhotoRoot()
{
    var home = Environment.GetEnvironmentVariable("HOME");
    return string.IsNullOrWhiteSpace(home)
        ? Path.Combine(AppContext.BaseDirectory, "order-photos")
        : Path.Combine(home, "data", "cardshop-order-photos");
}

static string SafePathSegment(string? value)
{
    var cleaned = Regex.Replace(value ?? "", "[^A-Za-z0-9_.-]", "-").Trim('-');
    return string.IsNullOrWhiteSpace(cleaned) ? "order" : cleaned;
}

static bool IsSupportedImageFile(string path)
{
    var extension = Path.GetExtension(path);
    return extension.Equals(".jpg", StringComparison.OrdinalIgnoreCase)
        || extension.Equals(".jpeg", StringComparison.OrdinalIgnoreCase)
        || extension.Equals(".png", StringComparison.OrdinalIgnoreCase)
        || extension.Equals(".webp", StringComparison.OrdinalIgnoreCase);
}

static string ImageContentType(string path) => Path.GetExtension(path).ToLowerInvariant() switch
{
    ".png" => "image/png",
    ".webp" => "image/webp",
    _ => "image/jpeg"
};

static IResult? ValidateSignup(SignupRequest request)
{
    var usernameError = UsernameValidationMessage(request.Username);
    if (usernameError is not null)
    {
        return Results.BadRequest(new { message = usernameError });
    }

    if (!IsValidEmail(request.Email))
    {
        return Results.BadRequest(new { message = "Email is not valid." });
    }

    if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
    {
        return Results.BadRequest(new { message = "Password must be at least 8 characters." });
    }

    return null;
}

static string? UsernameValidationMessage(string username)
{
    if (string.IsNullOrWhiteSpace(username) || username.Trim().Length < 3)
    {
        return "Username must be at least 3 characters.";
    }

    var trimmed = username.Trim();
    if (trimmed.Length > 50)
    {
        return "Username must be 50 characters or fewer.";
    }

    if (!Regex.IsMatch(trimmed, "^[A-Za-z0-9]+$"))
    {
        return "Username can only use letters and numbers.";
    }

    return null;
}

static bool IsValidEmail(string email)
{
    return !string.IsNullOrWhiteSpace(email)
        && Regex.IsMatch(email, @"^[^\s@]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}$", RegexOptions.IgnoreCase);
}

static string CreateToken()
{
    return Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
}

static string HashToken(string token)
{
    return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

static string? GetBearerToken(HttpRequest request)
{
    var authorization = request.Headers.Authorization.ToString();
    return authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
        ? authorization["Bearer ".Length..].Trim()
        : null;
}

static string? ResolveResetUrlBase(string? configuredResetUrlBase, string? requestedResetUrlBase, HttpRequest request, IReadOnlyCollection<string> allowedOrigins)
{
    if (IsHttpUrl(configuredResetUrlBase))
    {
        return configuredResetUrlBase!.Trim();
    }

    if (IsAllowedResetUrlBase(requestedResetUrlBase, allowedOrigins))
    {
        return requestedResetUrlBase!.Trim();
    }

    var apiUrlBase = $"{request.Scheme}://{request.Host}/";
    return IsHttpUrl(apiUrlBase) ? apiUrlBase : null;
}

static bool IsAllowedResetUrlBase(string? resetUrlBase, IReadOnlyCollection<string> allowedOrigins)
{
    var resetOrigin = NormalizeOrigin(resetUrlBase);
    if (resetOrigin is null)
    {
        return false;
    }

    return allowedOrigins
        .Select(NormalizeOrigin)
        .Where(origin => origin is not null)
        .Any(origin => string.Equals(origin, resetOrigin, StringComparison.OrdinalIgnoreCase));
}

static bool IsHttpUrl(string? url)
{
    return Uri.TryCreate(url?.Trim(), UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp);
}

static string? NormalizeOrigin(string? url)
{
    return Uri.TryCreate(url?.Trim(), UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp)
            ? $"{uri.Scheme}://{uri.Authority}"
            : null;
}

static async Task<AppUser?> GetAuthenticatedUser(HttpRequest request, Database db)
{
    var token = GetBearerToken(request);
    if (string.IsNullOrWhiteSpace(token))
    {
        return null;
    }

    return await db.GetUserBySessionAsync(HashToken(token));
}

static async Task<IResult> DeleteAuthenticatedUser(HttpRequest request, Database db)
{
    var user = await GetAuthenticatedUser(request, db);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    await db.DeleteUserAsync(user.Id);
    return Results.NoContent();
}

namespace CardShop.Api
{
    public sealed class AppUser
    {
        public int Id { get; set; }
        public required string Username { get; set; }
        public required string Email { get; set; }
        public required string PasswordHash { get; set; }
    }

    public sealed record SignupRequest(string Username, string Email, string Password);
    public sealed record LoginRequest(string Email, string Password);
    public sealed record PasswordResetRequest(string Email, string? ResetUrlBase);
    public sealed record PasswordResetConfirmRequest(string Email, string Token, string Password);
    public sealed record UserDto(int Id, string Username, string Email)
    {
        public static UserDto FromUser(AppUser user) => new(user.Id, user.Username, user.Email);
    }

    public sealed record AuthResponse(string Token, UserDto User)
    {
        public static AuthResponse FromUser(AppUser user, string token) => new(token, UserDto.FromUser(user));
    }

    public sealed record SaveCardRequest(
        string? CardApiId,
        string CardName,
        string? CardSet,
        string? CardNumber,
        string? ImageUrl,
        decimal? MarketPrice,
        decimal? ShopPrice);

    public sealed record UpdateCardPriceRequest(decimal? MarketPrice, decimal? ShopPrice);

    public sealed record OrderReceiptItem(
        string? ApiId,
        string Name,
        string? Set,
        string? Condition,
        string? Image,
        string? FrontImage,
        string? BackImage,
        string? PhotoFolderUrl,
        decimal ShopPrice,
        int Quantity);

    public sealed record OrderReceiptRequest(
        string Id,
        DateTimeOffset CreatedAt,
        string? PaymentMethod,
        string? Note,
        string? BuyerUsername,
        string? BuyerEmail,
        decimal Total,
        IReadOnlyList<OrderReceiptItem> Items);

    public sealed record SavedCardResponse(
        int Id,
        string? CardApiId,
        string CardName,
        string? CardSet,
        string? CardNumber,
        string? ImageUrl,
        decimal? MarketPrice,
        decimal? ShopPrice,
        DateTime CreatedAt);

    public sealed record StockCardResponse(
        string ApiId,
        string Name,
        string Set,
        string? Number,
        decimal Market,
        decimal ShopPrice,
        string Image,
        string? FrontImage,
        string? BackImage,
        string Condition,
        int Quantity,
        DateOnly PriceDate,
        DateTimeOffset CacheUntil);

    public sealed record StockCard(
        string ApiId,
        string Name,
        string Set,
        string? Number,
        decimal? FallbackMarket,
        string Image,
        string? FrontImage,
        string? BackImage,
        string Condition,
        int Quantity)
    {
        public StockCard(
            string ApiId,
            string Name,
            string Set,
            string? Number,
            decimal? FallbackMarket,
            string Image,
            string Condition,
            int Quantity)
            : this(ApiId, Name, Set, Number, FallbackMarket, Image, null, null, Condition, Quantity)
        {
        }
    }

    public sealed class StockPriceService(HttpClient httpClient)
    {
        private static readonly TimeZoneInfo ShopTimeZone = ResolveShopTimeZone();
        private static readonly IReadOnlyList<StockCard> StockCards = [
            new("sv3pt5-199", "Charizard ex Special Illustration Rare", "Pokémon 151", "199", 395m, "https://images.pokemontcg.io/sv3pt5/199_hires.png", "Near Mint", 1),
            new("swsh7-215", "Umbreon VMAX Alternate Art", "Evolving Skies", "215", 2037m, "https://images.pokemontcg.io/swsh7/215_hires.png", "Near Mint", 1),
            new("swsh11-186", "Giratina V Alternate Art", "Lost Origin", "186", 777m, "https://images.pokemontcg.io/swsh11/186_hires.png", "Near Mint", 1),
            new("swsh7-218", "Rayquaza VMAX Alternate Art", "Evolving Skies", "218", 962m, "https://images.pokemontcg.io/swsh7/218_hires.png", "Lightly Played", 1),
            new("swsh12-186", "Lugia V Alternate Art", "Silver Tempest", "186", 516m, "https://images.pokemontcg.io/swsh12/186_hires.png", "Near Mint", 1),
            new("svp-85", "Pikachu with Grey Felt Hat", "Promo", "85", 970m, "https://images.pokemontcg.io/svp/85_hires.png", "Near Mint", 1)
        ];

        private readonly SemaphoreSlim _refreshLock = new(1, 1);
        private IReadOnlyList<StockCardResponse>? _cachedStock;
        private DateOnly? _cachedDate;

        public Task<IReadOnlyList<StockCardResponse>> GetDefaultStockAsync() => GetStockAsync(StockCards);

        public async Task<IReadOnlyList<StockCardResponse>> GetStockAsync(IReadOnlyList<StockCard> stockCards)
        {
            var priceDate = CurrentPriceDate();
            var canUseCache = ReferenceEquals(stockCards, StockCards);
            if (canUseCache && _cachedStock is not null && _cachedDate == priceDate)
            {
                return _cachedStock;
            }

            await _refreshLock.WaitAsync();
            try
            {
                priceDate = CurrentPriceDate();
                if (canUseCache && _cachedStock is not null && _cachedDate == priceDate)
                {
                    return _cachedStock;
                }

                var refresh = await RefreshStockAsync(stockCards, priceDate, NextRefreshTime());
                if (canUseCache && refresh.HasLivePrice)
                {
                    _cachedStock = refresh.Cards;
                    _cachedDate = priceDate;
                    return _cachedStock;
                }

                return canUseCache ? _cachedStock ?? refresh.Cards : refresh.Cards;
            }
            finally
            {
                _refreshLock.Release();
            }
        }

        private async Task<StockRefreshResult> RefreshStockAsync(IReadOnlyList<StockCard> stockCards, DateOnly priceDate, DateTimeOffset cacheUntil)
        {
            var cards = await Task.WhenAll(stockCards.Select(async card =>
            {
                var apiCard = await FetchPokemonCardAsync(card.ApiId);
                var liveMarket = ReadMarketPrice(apiCard);
                var market = liveMarket is null
                    ? card.FallbackMarket ?? 0m
                    : ConditionPrice(liveMarket.Value, card.Condition);
                var image = ReadString(apiCard, "images", "large") ?? card.Image;
            var rawShop = market * 0.8m;
            var shopPrice = market > 35m ? RoundUpToNearest5(rawShop) : rawShop;
            return new StockRefreshCard(
                new StockCardResponse(
                card.ApiId,
                card.Name,
                card.Set,
                card.Number,
                market,
                shopPrice,
                image,
                    card.FrontImage,
                    card.BackImage,
                    card.Condition,
                    Math.Max(1, card.Quantity),
                        priceDate,
                        cacheUntil),
                    liveMarket is not null);
            }));

            return new StockRefreshResult(
                cards.Select(card => card.Response).ToArray(),
                cards.Any(card => card.HasLivePrice));
        }

        private async Task<JsonElement?> FetchPokemonCardAsync(string apiId)
        {
            try
            {
                using var response = await httpClient.GetAsync($"https://api.pokemontcg.io/v2/cards/{Uri.EscapeDataString(apiId)}");
                if (!response.IsSuccessStatusCode)
                {
                    return null;
                }

                using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
                return document.RootElement.TryGetProperty("data", out var data) ? data.Clone() : null;
            }
            catch
            {
                return null;
            }
        }

        private static decimal? ReadMarketPrice(JsonElement? card)
        {
            if (card is null ||
                !card.Value.TryGetProperty("tcgplayer", out var tcgplayer) ||
                !tcgplayer.TryGetProperty("prices", out var prices))
            {
                return null;
            }

            foreach (var priceName in new[] { "market", "mid", "low", "directLow" })
            {
                foreach (var priceGroup in prices.EnumerateObject())
                {
                    if (priceGroup.Value.TryGetProperty(priceName, out var price) &&
                        price.TryGetDecimal(out var value) &&
                        value > 0)
                    {
                        return value;
                    }
                }
            }

            return null;
        }

        private static decimal ConditionPrice(decimal price, string condition)
        {
            var multiplier = condition.Trim().ToLowerInvariant() switch
            {
                "light play" or "lightly played" => 0.85m,
                "moderately played" => 0.70m,
                "heavily played" => 0.55m,
                "damaged" => 0.35m,
                _ => 1m
            };

            return Math.Round(price * multiplier, 2, MidpointRounding.AwayFromZero);
        }

        private static decimal RoundUpToNearest5(decimal price) =>
            Math.Ceiling(price / 5m) * 5m;

        private static string? ReadString(JsonElement? element, params string[] path)
        {
            if (element is null)
            {
                return null;
            }

            var current = element.Value;
            foreach (var part in path)
            {
                if (!current.TryGetProperty(part, out current))
                {
                    return null;
                }
            }

            return current.GetString();
        }

        private static DateOnly CurrentPriceDate()
        {
            var shopNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ShopTimeZone);
            if (shopNow.Hour < 3)
            {
                shopNow = shopNow.AddDays(-1);
            }

            return DateOnly.FromDateTime(shopNow);
        }

        private static DateTimeOffset NextRefreshTime()
        {
            var shopNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, ShopTimeZone);
            var nextRefreshLocal = new DateTime(shopNow.Year, shopNow.Month, shopNow.Day, 3, 0, 0, DateTimeKind.Unspecified);
            if (shopNow.Hour >= 3)
            {
                nextRefreshLocal = nextRefreshLocal.AddDays(1);
            }

            var nextRefreshUtc = TimeZoneInfo.ConvertTimeToUtc(nextRefreshLocal, ShopTimeZone);
            return new DateTimeOffset(nextRefreshUtc, TimeSpan.Zero);
        }

        private static TimeZoneInfo ResolveShopTimeZone()
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Central Standard Time");
            }
            catch (TimeZoneNotFoundException)
            {
                return TimeZoneInfo.FindSystemTimeZoneById("America/Chicago");
            }
        }

        private sealed record StockRefreshResult(IReadOnlyList<StockCardResponse> Cards, bool HasLivePrice);

        private sealed record StockRefreshCard(StockCardResponse Response, bool HasLivePrice);
    }

    public sealed class Database(IConfiguration configuration)
    {
        private readonly string _connectionString = configuration.GetConnectionString("CardShop")
            ?? throw new InvalidOperationException("Missing ConnectionStrings:CardShop.");

        public async Task<bool> UsernameExistsAsync(string username)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                SELECT COUNT(1)
                FROM Users
                WHERE LOWER(Username) = LOWER(@Username);
                """, connection);
            command.Parameters.AddWithValue("@Username", username);
            return Convert.ToInt32(await command.ExecuteScalarAsync()) > 0;
        }

        public async Task<bool> EmailExistsAsync(string email)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                SELECT COUNT(1)
                FROM Users
                WHERE LOWER(Email) = LOWER(@Email);
                """, connection);
            command.Parameters.AddWithValue("@Email", email);
            return Convert.ToInt32(await command.ExecuteScalarAsync()) > 0;
        }

        public async Task<bool> UserExistsAsync(string username, string email)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                SELECT COUNT(1)
                FROM Users
                WHERE LOWER(Username) = LOWER(@Username)
                   OR LOWER(Email) = LOWER(@Email);
                """, connection);
            command.Parameters.AddWithValue("@Username", username.Trim());
            command.Parameters.AddWithValue("@Email", email.Trim());
            return Convert.ToInt32(await command.ExecuteScalarAsync()) > 0;
        }

        public async Task<AppUser> CreateUserAsync(AppUser user)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                INSERT INTO Users (Username, Email, PasswordHash)
                OUTPUT INSERTED.Id
                VALUES (@Username, @Email, @PasswordHash);
                """, connection);
            command.Parameters.AddWithValue("@Username", user.Username);
            command.Parameters.AddWithValue("@Email", user.Email);
            command.Parameters.AddWithValue("@PasswordHash", user.PasswordHash);
            user.Id = Convert.ToInt32(await command.ExecuteScalarAsync());
            return user;
        }

        public async Task<AppUser?> GetUserByEmailAsync(string email)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                SELECT TOP 1 Id, Username, Email, PasswordHash
                FROM Users
                WHERE LOWER(Email) = LOWER(@Email);
                """, connection);
            command.Parameters.AddWithValue("@Email", email);
            await using var reader = await command.ExecuteReaderAsync();
            return await reader.ReadAsync() ? ReadUser(reader) : null;
        }

        public async Task CreateSessionAsync(int userId, string tokenHash)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                INSERT INTO UserSessions (UserId, TokenHash, ExpiresAt)
                VALUES (@UserId, @TokenHash, DATEADD(day, 30, SYSUTCDATETIME()));
                """, connection);
            command.Parameters.AddWithValue("@UserId", userId);
            command.Parameters.AddWithValue("@TokenHash", tokenHash);
            await command.ExecuteNonQueryAsync();
        }

        public async Task DeleteSessionAsync(string tokenHash)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("DELETE FROM UserSessions WHERE TokenHash = @TokenHash;", connection);
            command.Parameters.AddWithValue("@TokenHash", tokenHash);
            await command.ExecuteNonQueryAsync();
        }

        public async Task DeleteSessionsForUserAsync(int userId)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("DELETE FROM UserSessions WHERE UserId = @UserId;", connection);
            command.Parameters.AddWithValue("@UserId", userId);
            await command.ExecuteNonQueryAsync();
        }

        public async Task<AppUser?> GetUserBySessionAsync(string tokenHash)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                DELETE FROM UserSessions WHERE ExpiresAt <= SYSUTCDATETIME();

                SELECT TOP 1 u.Id, u.Username, u.Email, u.PasswordHash
                FROM UserSessions s
                JOIN Users u ON u.Id = s.UserId
                WHERE s.TokenHash = @TokenHash;
                """, connection);
            command.Parameters.AddWithValue("@TokenHash", tokenHash);
            await using var reader = await command.ExecuteReaderAsync();
            return await reader.ReadAsync() ? ReadUser(reader) : null;
        }

        public async Task CreatePasswordResetTokenAsync(int userId, string tokenHash)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                DELETE FROM PasswordResetTokens
                WHERE UserId = @UserId AND (UsedAt IS NULL OR ExpiresAt <= SYSUTCDATETIME());

                INSERT INTO PasswordResetTokens (UserId, TokenHash, ExpiresAt)
                VALUES (@UserId, @TokenHash, DATEADD(hour, 1, SYSUTCDATETIME()));
                """, connection);
            command.Parameters.AddWithValue("@UserId", userId);
            command.Parameters.AddWithValue("@TokenHash", tokenHash);
            await command.ExecuteNonQueryAsync();
        }

        public async Task<AppUser?> GetUserByValidPasswordResetTokenAsync(string email, string tokenHash)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                DELETE FROM PasswordResetTokens WHERE ExpiresAt <= SYSUTCDATETIME();

                SELECT TOP 1 u.Id, u.Username, u.Email, u.PasswordHash
                FROM PasswordResetTokens t
                JOIN Users u ON u.Id = t.UserId
                WHERE LOWER(u.Email) = LOWER(@Email)
                  AND t.TokenHash = @TokenHash
                  AND t.UsedAt IS NULL
                  AND t.ExpiresAt > SYSUTCDATETIME();
                """, connection);
            command.Parameters.AddWithValue("@Email", email);
            command.Parameters.AddWithValue("@TokenHash", tokenHash);
            await using var reader = await command.ExecuteReaderAsync();
            return await reader.ReadAsync() ? ReadUser(reader) : null;
        }

        public async Task MarkPasswordResetTokenUsedAsync(string tokenHash)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                UPDATE PasswordResetTokens
                SET UsedAt = SYSUTCDATETIME()
                WHERE TokenHash = @TokenHash;
                """, connection);
            command.Parameters.AddWithValue("@TokenHash", tokenHash);
            await command.ExecuteNonQueryAsync();
        }

        public async Task UpdatePasswordAsync(int userId, string passwordHash)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                UPDATE Users
                SET PasswordHash = @PasswordHash
                WHERE Id = @UserId;
                """, connection);
            command.Parameters.AddWithValue("@UserId", userId);
            command.Parameters.AddWithValue("@PasswordHash", passwordHash);
            await command.ExecuteNonQueryAsync();
        }

        public async Task<IReadOnlyList<SavedCardResponse>> GetCardsAsync(int userId)
        {
            var cards = new List<SavedCardResponse>();
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                SELECT Id, CardApiId, CardName, CardSet, CardNumber, ImageUrl, MarketPrice, ShopPrice, CreatedAt
                FROM ScannedCards
                WHERE UserId = @UserId
                ORDER BY CreatedAt DESC;
                """, connection);
            command.Parameters.AddWithValue("@UserId", userId);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                cards.Add(ReadCard(reader));
            }
            return cards;
        }

        public async Task<SavedCardResponse> SaveCardAsync(int userId, SaveCardRequest card)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                INSERT INTO ScannedCards (UserId, CardApiId, CardName, CardSet, CardNumber, ImageUrl, MarketPrice, ShopPrice)
                OUTPUT INSERTED.Id, INSERTED.CardApiId, INSERTED.CardName, INSERTED.CardSet, INSERTED.CardNumber,
                       INSERTED.ImageUrl, INSERTED.MarketPrice, INSERTED.ShopPrice, INSERTED.CreatedAt
                VALUES (@UserId, @CardApiId, @CardName, @CardSet, @CardNumber, @ImageUrl, @MarketPrice, @ShopPrice);
                """, connection);
            command.Parameters.AddWithValue("@UserId", userId);
            command.Parameters.AddWithValue("@CardApiId", DbValue(card.CardApiId));
            command.Parameters.AddWithValue("@CardName", card.CardName);
            command.Parameters.AddWithValue("@CardSet", DbValue(card.CardSet));
            command.Parameters.AddWithValue("@CardNumber", DbValue(card.CardNumber));
            command.Parameters.AddWithValue("@ImageUrl", DbValue(card.ImageUrl));
            command.Parameters.AddWithValue("@MarketPrice", DbValue(card.MarketPrice));
            command.Parameters.AddWithValue("@ShopPrice", DbValue(card.ShopPrice));
            await using var reader = await command.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
            {
                throw new InvalidOperationException("Saved card insert did not return a row.");
            }
            return ReadCard(reader);
        }

        public async Task<SavedCardResponse?> UpdateCardPriceAsync(int userId, int id, UpdateCardPriceRequest price)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                UPDATE ScannedCards
                SET MarketPrice = @MarketPrice,
                    ShopPrice = @ShopPrice
                OUTPUT INSERTED.Id, INSERTED.CardApiId, INSERTED.CardName, INSERTED.CardSet, INSERTED.CardNumber,
                       INSERTED.ImageUrl, INSERTED.MarketPrice, INSERTED.ShopPrice, INSERTED.CreatedAt
                WHERE Id = @Id AND UserId = @UserId;
                """, connection);
            command.Parameters.AddWithValue("@Id", id);
            command.Parameters.AddWithValue("@UserId", userId);
            command.Parameters.AddWithValue("@MarketPrice", DbValue(price.MarketPrice));
            command.Parameters.AddWithValue("@ShopPrice", DbValue(price.ShopPrice));
            await using var reader = await command.ExecuteReaderAsync();
            return await reader.ReadAsync() ? ReadCard(reader) : null;
        }

        public async Task DeleteCardAsync(int userId, int id)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("DELETE FROM ScannedCards WHERE Id = @Id AND UserId = @UserId;", connection);
            command.Parameters.AddWithValue("@Id", id);
            command.Parameters.AddWithValue("@UserId", userId);
            await command.ExecuteNonQueryAsync();
        }

        public async Task DeleteUserAsync(int userId)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var transaction = await connection.BeginTransactionAsync();
            await using var command = new SqlCommand("""
                DELETE FROM ScannedCards WHERE UserId = @UserId;
                DELETE FROM PasswordResetTokens WHERE UserId = @UserId;
                DELETE FROM UserSessions WHERE UserId = @UserId;
                DELETE FROM Users WHERE Id = @UserId;
                """, connection, (SqlTransaction)transaction);
            command.Parameters.AddWithValue("@UserId", userId);
            await command.ExecuteNonQueryAsync();
            await transaction.CommitAsync();
        }

        public async Task<IReadOnlyList<StockCard>> GetPokemonStockCardsAsync()
        {
            var cards = new List<StockCard>();
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                DECLARE @sql NVARCHAR(MAX) = N'
                    SELECT CardApiId,
                           CardName,
                           CardSet,
                           CardNumber,
                           ImageUrl,
                           ' + CASE WHEN COL_LENGTH('dbo.PokemonStock', 'FrontImageUrl') IS NULL THEN N'CAST(NULL AS NVARCHAR(MAX))' ELSE N'FrontImageUrl' END + N' AS FrontImageUrl,
                           ' + CASE WHEN COL_LENGTH('dbo.PokemonStock', 'BackImageUrl') IS NULL THEN N'CAST(NULL AS NVARCHAR(MAX))' ELSE N'BackImageUrl' END + N' AS BackImageUrl,
                           MarketPrice,
                           Condition,
                           Quantity
                    FROM PokemonStock
                    WHERE Quantity > 0
                    ORDER BY SortOrder ASC, CreatedAt DESC;';
                EXEC sys.sp_executesql @sql;
                """, connection);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                cards.Add(new StockCard(
                    reader.GetString(0),
                    reader.GetString(1),
                    reader.GetString(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3),
                    reader.IsDBNull(7) ? null : reader.GetDecimal(7),
                    reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                    reader.IsDBNull(5) ? null : reader.GetString(5),
                    reader.IsDBNull(6) ? null : reader.GetString(6),
                    reader.GetString(8),
                    reader.GetInt32(9)));
            }
            return cards;
        }

        public async Task<bool> TryApplyPokemonStockPurchaseAsync(IReadOnlyList<OrderReceiptItem> items)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var transaction = await connection.BeginTransactionAsync();

            foreach (var item in items)
            {
                if (string.IsNullOrWhiteSpace(item.ApiId) || item.Quantity <= 0)
                {
                    await transaction.RollbackAsync();
                    return false;
                }

                await using var command = new SqlCommand("""
                    UPDATE PokemonStock
                    SET Quantity = Quantity - @Quantity
                    WHERE CardApiId = @CardApiId
                      AND Quantity >= @Quantity;
                    """, connection, (SqlTransaction)transaction);
                command.Parameters.AddWithValue("@CardApiId", item.ApiId);
                command.Parameters.AddWithValue("@Quantity", item.Quantity);
                var updated = await command.ExecuteNonQueryAsync();
                if (updated != 1)
                {
                    await transaction.RollbackAsync();
                    return false;
                }
            }

            await transaction.CommitAsync();
            return true;
        }

        private static AppUser ReadUser(SqlDataReader reader) => new()
        {
            Id = reader.GetInt32(0),
            Username = reader.GetString(1),
            Email = reader.GetString(2),
            PasswordHash = reader.GetString(3)
        };

        private static SavedCardResponse ReadCard(SqlDataReader reader) => new(
            reader.GetInt32(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetString(5),
            reader.IsDBNull(6) ? null : reader.GetDecimal(6),
            reader.IsDBNull(7) ? null : reader.GetDecimal(7),
            reader.GetDateTime(8));

        private static object DbValue(object? value) => value is null ? DBNull.Value : value;
    }

    public sealed class EmailSender(IConfiguration configuration)
    {
        private readonly IConfigurationSection _emailConfig = configuration.GetSection("Email");

        public bool IsConfigured =>
            !string.IsNullOrWhiteSpace(_emailConfig["SmtpHost"])
            && !string.IsNullOrWhiteSpace(_emailConfig["FromAddress"]);

        public string? ResetUrlBase => _emailConfig["ResetUrlBase"];

        public async Task SendOrderReceiptAsync(OrderReceiptRequest order)
        {
            await SendEmailAsync(
                "pokepawnsupport@gmail.com",
                $"CardShop order receipt - {order.Total:C}",
                OrderReceiptHtml(order, "New CardShop order receipt"),
                isHtml: true);
        }

        public async Task SendBuyerOrderReceiptAsync(OrderReceiptRequest order)
        {
            if (string.IsNullOrWhiteSpace(order.BuyerEmail))
            {
                return;
            }

            await SendEmailAsync(
                order.BuyerEmail,
                $"Your CardShop receipt - {order.Total:C}",
                OrderReceiptHtml(order, "Thank you for your purchase:"),
                isHtml: true);
        }

        private static string OrderReceiptHtml(OrderReceiptRequest order, string heading)
        {
            var lines = order.Items.Select(item =>
            {
                var name = string.IsNullOrWhiteSpace(item.Name) ? "Pokemon card" : item.Name;
                var details = string.Join(" - ", new[] { item.Set, item.Condition }.Where(value => !string.IsNullOrWhiteSpace(value)));
                var subtotal = item.ShopPrice * item.Quantity;
                return $"""
                    <tr>
                      <td style="padding:12px;border-top:1px solid #d9d4c8;width:110px;vertical-align:top;">
                        <img src="{WebUtility.HtmlEncode(item.Image)}" alt="{WebUtility.HtmlEncode(name)}" style="max-width:95px;border-radius:6px;">
                      </td>
                      <td style="padding:12px;border-top:1px solid #d9d4c8;vertical-align:top;">
                        <strong style="font-size:16px;">{WebUtility.HtmlEncode(name)}</strong><br>
                        <span style="color:#5f6b75;font-weight:700;">{WebUtility.HtmlEncode(details)}</span><br>
                        Quantity: {item.Quantity}<br>
                        Price each: {item.ShopPrice:C}<br>
                        Subtotal: {subtotal:C}
                      </td>
                    </tr>
                    <tr>
                      <td colspan="2" style="padding:0 12px 14px;border-bottom:1px solid #d9d4c8;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                          <tr>
                            <td style="width:50%;padding-right:8px;vertical-align:top;">
                              <div style="font-weight:800;color:#22766f;margin-bottom:6px;">Front</div>
                              <a href="{WebUtility.HtmlEncode(item.FrontImage)}"><img src="{WebUtility.HtmlEncode(item.FrontImage)}" alt="{WebUtility.HtmlEncode(name)} front" style="max-width:100%;border-radius:6px;border:1px solid #d9d4c8;"></a>
                            </td>
                            <td style="width:50%;padding-left:8px;vertical-align:top;">
                              <div style="font-weight:800;color:#22766f;margin-bottom:6px;">Back</div>
                              <a href="{WebUtility.HtmlEncode(item.BackImage)}"><img src="{WebUtility.HtmlEncode(item.BackImage)}" alt="{WebUtility.HtmlEncode(name)} back" style="max-width:100%;border-radius:6px;border:1px solid #d9d4c8;"></a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    """;
            });

            return $"""
                <!doctype html>
                <html>
                <body style="margin:0;padding:24px;background:#f7f5ef;font-family:Segoe UI,Arial,sans-serif;color:#15212b;">
                  <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #d9d4c8;border-radius:8px;padding:22px;">
                    <p style="color:#22766f;font-weight:900;text-transform:uppercase;margin:0 0 12px;">CardShop Collectables</p>
                    <h1 style="font-size:30px;line-height:1.1;margin:0 0 18px;">{WebUtility.HtmlEncode(heading)}</h1>
                    <p style="line-height:1.55;margin:0 0 18px;">
                      <strong>Order ID:</strong> {WebUtility.HtmlEncode(order.Id)}<br>
                      <strong>Ordered:</strong> {WebUtility.HtmlEncode(FormatCentralTime(order.CreatedAt))}<br>
                      <strong>Buyer:</strong> {WebUtility.HtmlEncode(order.BuyerUsername ?? "Guest")}<br>
                      <strong>Buyer email:</strong> {WebUtility.HtmlEncode(order.BuyerEmail ?? "Not provided")}<br>
                      <strong>Payment method:</strong> {WebUtility.HtmlEncode(order.PaymentMethod ?? "Not provided")}<br>
                      <strong>Contact/pickup note:</strong> {WebUtility.HtmlEncode(order.Note ?? "None")}
                    </p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                      {string.Join("", lines)}
                    </table>
                    <p style="font-size:22px;font-weight:900;color:#d83a35;text-align:right;margin:20px 0 0;">Total: {order.Total:C}</p>
                  </div>
                </body>
                </html>
                """;
        }

        private static string FormatCentralTime(DateTimeOffset timestamp)
        {
            TimeZoneInfo centralTime;
            try
            {
                centralTime = TimeZoneInfo.FindSystemTimeZoneById("Central Standard Time");
            }
            catch (TimeZoneNotFoundException)
            {
                centralTime = TimeZoneInfo.FindSystemTimeZoneById("America/Chicago");
            }

            var localTime = TimeZoneInfo.ConvertTime(timestamp, centralTime);
            var zoneLabel = centralTime.IsDaylightSavingTime(localTime.DateTime) ? "CDT" : "CST";
            return $"{localTime:yyyy-MM-dd h:mm:ss tt} {zoneLabel}";
        }

        public async Task SendPasswordResetAsync(string toEmail, string username, string resetUrl)
        {
            await SendEmailAsync(
                toEmail,
                "Reset your CardShop Collectables password",
                $"""
                Hi {username},

                Click the link below to reset your password. This link expires in 1 hour.

                {resetUrl}

                If you did not ask to reset your password, you can ignore this email.
                """);
        }

        private async Task SendEmailAsync(string toEmail, string subject, string body, bool isHtml = false)
        {
            var host = _emailConfig["SmtpHost"];
            var fromAddress = _emailConfig["FromAddress"];
            if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(fromAddress))
            {
                throw new InvalidOperationException("Email:SmtpHost and Email:FromAddress are required.");
            }

            var port = int.TryParse(_emailConfig["SmtpPort"], out var configuredPort) ? configuredPort : 587;
            var enableSsl = !bool.TryParse(_emailConfig["EnableSsl"], out var configuredSsl) || configuredSsl;
            var fromName = string.IsNullOrWhiteSpace(_emailConfig["FromName"]) ? "CardShop Collectables" : _emailConfig["FromName"];

            using var message = new MailMessage
            {
                From = new MailAddress(fromAddress, fromName),
                Subject = subject,
                Body = body,
                IsBodyHtml = isHtml
            };
            message.To.Add(toEmail);

            using var client = new SmtpClient(host, port)
            {
                EnableSsl = enableSsl
            };

            var smtpUser = _emailConfig["SmtpUser"];
            var smtpPassword = _emailConfig["SmtpPassword"];
            if (!string.IsNullOrWhiteSpace(smtpUser) && !string.IsNullOrWhiteSpace(smtpPassword))
            {
                client.Credentials = new NetworkCredential(smtpUser, smtpPassword);
            }

            await client.SendMailAsync(message);
        }
    }
}
