namespace ModularCA.Tests.TestUtils;

/// <summary>
/// A <see cref="TimeProvider"/> whose "now" is a single mutable field. Tests construct one with
/// a starting time, run the code under test, and (optionally) advance <see cref="Now"/> between
/// invocations. Suitable when production code reads time multiple times during a single call but
/// the test doesn't need each read to differ — use <see cref="QueueTimeProvider"/> when each
/// read should return a distinct value (e.g. midnight-crossing tests).
/// </summary>
internal sealed class FixedTimeProvider : TimeProvider
{
    public DateTimeOffset Now { get; set; }

    public FixedTimeProvider(DateTimeOffset now) { Now = now; }

    public override DateTimeOffset GetUtcNow() => Now;
}
