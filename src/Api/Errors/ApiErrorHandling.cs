using Microsoft.AspNetCore.Diagnostics;

namespace Api.Errors;

/// <summary>
/// Sprowadza do kontraktu <see cref="ApiError"/> te odpowiedzi błędne, których
/// nie tworzy żaden nasz endpoint: nieobsłużone wyjątki oraz statusy generowane
/// przez sam framework (404 z routingu, 405). Bez tego kontrakt obowiązywałby
/// wyłącznie w ścieżkach napisanych ręcznie, a pierwsza literówka w adresie
/// dawałaby odpowiedź w cudzym formacie.
/// </summary>
internal static class ApiErrorHandling
{
    /// <summary>
    /// Ogólny komunikat dla nieobsłużonego wyjątku poza Development. Treść
    /// wyjątku bywa nośna — nazwy tabel, ścieżki, fragmenty zapytań — więc poza
    /// maszyną deweloperską do odpowiedzi nie trafia; zostaje w logu, który
    /// pisze middleware obsługi wyjątków.
    /// </summary>
    private const string InternalErrorMessage =
        "Wystąpił nieoczekiwany błąd serwera. Spróbuj ponownie później.";

    public static WebApplication UseApiErrorContract(this WebApplication app)
    {
        var includeExceptionMessage = app.Environment.IsDevelopment();

        // Kolejność jest celowa: obsługa wyjątków obejmuje obsługę statusów,
        // więc wyjątek rzucony przy budowaniu odpowiedzi na 404 też kończy się
        // kontraktem, a nie pustą odpowiedzią.
        app.UseExceptionHandler(handler => handler.Run(
            context => WriteUnhandledExceptionAsync(context, includeExceptionMessage)));

        app.UseStatusCodePages(statusCode => WriteFrameworkStatusAsync(statusCode.HttpContext));

        return app;
    }

    private static Task WriteUnhandledExceptionAsync(HttpContext context, bool includeExceptionMessage)
    {
        var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;

        var error = ApiError.Create(
            ApiErrorCodes.InternalError,
            includeExceptionMessage && exception is not null
                ? exception.Message
                : InternalErrorMessage,
            // Identyfikator żądania wraca do klienta po to, żeby zgłoszenie
            // użytkownika dało się połączyć z konkretnym wpisem w logu.
            new Dictionary<string, object?>
            {
                ["requestId"] = context.TraceIdentifier,
            });

        return WriteAsync(context, StatusCodes.Status500InternalServerError, error);
    }

    private static Task WriteFrameworkStatusAsync(HttpContext context)
    {
        var status = context.Response.StatusCode;

        var (code, message) = status switch
        {
            StatusCodes.Status404NotFound => (
                ApiErrorCodes.NotFound,
                "Nie znaleziono zasobu pod wskazanym adresem."),
            StatusCodes.Status405MethodNotAllowed => (
                ApiErrorCodes.MethodNotAllowed,
                "Ta metoda HTTP nie jest obsługiwana przez wskazany zasób."),
            _ => (
                ApiErrorCodes.HttpError,
                "Żądanie nie mogło zostać obsłużone."),
        };

        var error = ApiError.Create(
            code,
            message,
            new Dictionary<string, object?>
            {
                ["status"] = status,
                ["path"] = context.Request.Path.Value,
                ["method"] = context.Request.Method,
            });

        return WriteAsync(context, status, error);
    }

    // Status ustawiany jest jawnie, bo obie ścieżki dochodzą tu z różnych stanów
    // odpowiedzi i w obu kod HTTP jest częścią kontraktu na równi z treścią —
    // nie skutkiem ubocznym tego, co zrobił z nim wcześniejszy middleware.
    private static Task WriteAsync(HttpContext context, int statusCode, ApiError error)
    {
        context.Response.StatusCode = statusCode;

        return context.Response.WriteAsJsonAsync(error, context.RequestAborted);
    }
}
