using System.Text.Json;
using System.Text.Json.Serialization;

namespace ModularCA.API.Json;

/// <summary>
/// Serializes every <see cref="DateTime"/> as an ISO-8601 UTC instant with a trailing <c>Z</c>.
/// <para>
/// The app stores and computes time in UTC, but timestamps reach the JSON layer with inconsistent
/// <see cref="DateTime.Kind"/>: EF reads MySQL <c>datetime</c> columns back as
/// <see cref="DateTimeKind.Unspecified"/>, and library helpers (e.g. NCrontab's
/// <c>GetNextOccurrence</c>) also return <see cref="DateTimeKind.Unspecified"/>. The default
/// <c>System.Text.Json</c> behaviour omits the <c>Z</c> for non-UTC kinds, so browsers parse those
/// values as <em>local</em> time and every relative/absolute label shifts by the client's UTC offset.
/// </para>
/// <para>
/// Normalising at the serialization boundary fixes this uniformly for all responses — EF-loaded,
/// computed, or hand-built — without per-property attributes. The matching <c>JsonConverter</c> is
/// applied to <c>DateTime?</c> properties automatically by System.Text.Json's nullable handling.
/// </para>
/// </summary>
public sealed class UtcDateTimeJsonConverter : JsonConverter<DateTime>
{
    /// <summary>
    /// Reads a timestamp and returns it as a UTC-kind <see cref="DateTime"/>. A value with no zone
    /// designator is assumed to already be UTC (the app's convention); a local value is converted.
    /// </summary>
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var value = reader.GetDateTime();
        return ToUtc(value);
    }

    /// <summary>
    /// Writes the value as a UTC instant with a trailing <c>Z</c>, regardless of its source kind.
    /// Once the kind is <see cref="DateTimeKind.Utc"/>, System.Text.Json emits the ISO-8601 'Z'
    /// suffix at full round-trip precision.
    /// </summary>
    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        writer.WriteStringValue(ToUtc(value));
    }

    private static DateTime ToUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Local => value.ToUniversalTime(),
        // Unspecified values are UTC by the app's convention — tag them so the 'Z' is emitted.
        DateTimeKind.Unspecified => DateTime.SpecifyKind(value, DateTimeKind.Utc),
        _ => value,
    };
}
