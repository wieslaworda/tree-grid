using Api.Mail;
using Microsoft.Extensions.Configuration;

namespace Api.Tests;

/// <summary>
/// Regresja kontroli konfiguracji poczty, na której stoi odmowa startu poza
/// Development (<c>Program.cs</c>): transport plikowy i niekompletny SMTP mają
/// dawać problemy nazwane kluczem — w obu zapisach, z dwukropkiem i jako
/// zmienna środowiskowa — i nigdy wartością (lekcja „Sekrety…").
///
/// Testy nie podnoszą hosta: <see cref="MailSettings"/> czyta zwykłą
/// <c>IConfiguration</c>, więc wystarczy konfiguracja w pamięci.
/// </summary>
public class MailSettingsTests
{
    private const string Password = "sekretne-haslo-aplikacji";

    private static readonly Dictionary<string, string?> CompleteSmtp = new()
    {
        ["Mail:Transport"] = "Smtp",
        ["Mail:From"] = "nadawca@example.com",
        ["Mail:Smtp:Host"] = "smtp.example.com",
        ["Mail:Smtp:Port"] = "587",
        ["Mail:Smtp:UserName"] = "nadawca@example.com",
        ["Mail:Smtp:Password"] = Password,
    };

    [Fact]
    public void Complete_smtp_has_no_problems_outside_development()
    {
        Assert.Empty(Settings(CompleteSmtp).FindProblems(isDevelopment: false));
    }

    [Fact]
    public void Directory_transport_is_a_problem_outside_development()
    {
        var values = new Dictionary<string, string?>(CompleteSmtp)
        {
            ["Mail:Transport"] = "Directory",
            ["Mail:Directory:Path"] = "MailOutbox",
        };

        var problem = Assert.Single(Settings(values).FindProblems(isDevelopment: false));

        Assert.Contains("Mail:Transport", problem);
        Assert.Contains("Mail__Transport", problem);
    }

    [Fact]
    public void Directory_transport_with_a_path_has_no_problems_in_development()
    {
        var values = new Dictionary<string, string?>
        {
            ["Mail:Transport"] = "Directory",
            ["Mail:From"] = "nadawca@example.com",
            ["Mail:Directory:Path"] = "MailOutbox",
        };

        Assert.Empty(Settings(values).FindProblems(isDevelopment: true));
    }

    [Fact]
    public void Directory_transport_without_a_path_is_a_problem_in_development()
    {
        var values = new Dictionary<string, string?>
        {
            ["Mail:Transport"] = "Directory",
            ["Mail:From"] = "nadawca@example.com",
        };

        var problem = Assert.Single(Settings(values).FindProblems(isDevelopment: true));

        Assert.Contains("Mail:Directory:Path", problem);
        Assert.Contains("Mail__Directory__Path", problem);
    }

    [Theory]
    [InlineData("Mail:Smtp:Host", "Mail__Smtp__Host")]
    [InlineData("Mail:Smtp:Port", "Mail__Smtp__Port")]
    [InlineData("Mail:Smtp:UserName", "Mail__Smtp__UserName")]
    [InlineData("Mail:Smtp:Password", "Mail__Smtp__Password")]
    [InlineData("Mail:From", "Mail__From")]
    public void Each_missing_smtp_key_is_a_problem_named_by_the_key_without_any_value(string key, string environmentName)
    {
        var values = new Dictionary<string, string?>(CompleteSmtp) { [key] = "" };

        foreach (var isDevelopment in new[] { false, true })
        {
            var problem = Assert.Single(Settings(values).FindProblems(isDevelopment));

            Assert.Contains($"'{key}'", problem);
            Assert.Contains(environmentName, problem);

            // Żadna z wartości konfiguracji — a już na pewno hasło — nie
            // trafia do komunikatu, który ląduje w logu startu. Bez wartości
            // transportu: „Smtp" jest częścią nazw kluczy.
            foreach (var (configKey, value) in CompleteSmtp)
            {
                if (configKey != "Mail:Transport")
                {
                    Assert.DoesNotContain(value!, problem);
                }
            }
        }
    }

    [Fact]
    public void Invalid_port_is_a_problem_without_its_value()
    {
        var values = new Dictionary<string, string?>(CompleteSmtp) { ["Mail:Smtp:Port"] = "siedem" };

        var problem = Assert.Single(Settings(values).FindProblems(isDevelopment: false));

        Assert.Contains("Mail:Smtp:Port", problem);
        Assert.DoesNotContain("siedem", problem);
    }

    [Fact]
    public void Unknown_transport_is_a_problem_without_its_value_in_development()
    {
        var values = new Dictionary<string, string?>(CompleteSmtp) { ["Mail:Transport"] = "Pigeon" };

        var problem = Assert.Single(Settings(values).FindProblems(isDevelopment: true));

        Assert.Contains("Mail:Transport", problem);
        Assert.DoesNotContain("Pigeon", problem);
    }

    [Fact]
    public void Relative_directory_path_is_resolved_against_the_content_root()
    {
        var contentRoot = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "treegrid-content-root"));
        var values = new Dictionary<string, string?> { ["Mail:Directory:Path"] = "MailOutbox" };

        var settings = MailSettings.FromConfiguration(Configuration(values), contentRoot);

        Assert.Equal(Path.Combine(contentRoot, "MailOutbox"), settings.DirectoryPath);
    }

    private static MailSettings Settings(Dictionary<string, string?> values)
        => MailSettings.FromConfiguration(Configuration(values), Path.GetTempPath());

    private static IConfiguration Configuration(Dictionary<string, string?> values)
        => new ConfigurationBuilder().AddInMemoryCollection(values).Build();
}
