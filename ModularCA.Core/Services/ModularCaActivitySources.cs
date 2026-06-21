using System.Diagnostics;
using System.Reflection;

namespace ModularCA.Core.Services;

/// <summary>
/// Central <see cref="ActivitySource"/> registry for ModularCA. Services that start
/// spans for tracing look up their source here instead of each file creating its own.
/// </summary>
/// <remarks>
/// This is the scaffolding step of a larger OpenTelemetry rollout.
/// The spans these sources emit are visible to any listener installed by the host
/// (<c>System.Diagnostics.DiagnosticSource</c> built-in, or OTel / Application Insights
/// SDKs once an operator opts in). Adding an OTel package dependency and wiring up an
/// OTLP exporter is deferred: the full rollout is a larger config-surface change than
/// this scaffolding step budgets for.
/// </remarks>
public static class ModularCaActivitySources
{
    /// <summary>Product version string stamped on every activity source.</summary>
    public static readonly string Version =
        typeof(ModularCaActivitySources).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? "0.1.0-dev";

    /// <summary>Spans emitted by the ASP.NET request pipeline and API controllers.</summary>
    public static readonly ActivitySource Api = new("ModularCA.Api", Version);

    /// <summary>Spans emitted by CA creation, issuance, and revocation flows.</summary>
    public static readonly ActivitySource Issuance = new("ModularCA.Issuance", Version);

    /// <summary>Spans emitted by keystore read/write/sign paths (software + HSM).</summary>
    public static readonly ActivitySource Keystore = new("ModularCA.Keystore", Version);

    /// <summary>Spans emitted by protocol handlers (EST, SCEP, CMP, ACME, OCSP, TSA).</summary>
    public static readonly ActivitySource Protocols = new("ModularCA.Protocols", Version);

    /// <summary>Spans emitted by scheduler/background jobs.</summary>
    public static readonly ActivitySource Scheduler = new("ModularCA.Scheduler", Version);
}
