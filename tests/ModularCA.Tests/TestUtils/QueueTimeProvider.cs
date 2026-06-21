namespace ModularCA.Tests.TestUtils;

/// <summary>
/// A <see cref="TimeProvider"/> whose <see cref="GetUtcNow"/> dequeues from a fixed sequence,
/// returning each successive caller a different time. Use when a single async call reads time
/// multiple times and the test needs each read to differ — e.g. the midnight-crossing test
/// where the first read produces yesterday's date and the next produces today's. Once the
/// queue is exhausted, falls back to a fixed final value so over-consumption doesn't crash
/// (preserves test diagnostic clarity — assertion on log row count tells the real story).
/// </summary>
internal sealed class QueueTimeProvider : TimeProvider
{
    private readonly Queue<DateTimeOffset> _queue;
    private DateTimeOffset _last;

    public QueueTimeProvider(IEnumerable<DateTimeOffset> times)
    {
        _queue = new Queue<DateTimeOffset>(times);
        _last = _queue.Count > 0 ? _queue.Peek() : DateTimeOffset.UtcNow;
    }

    public override DateTimeOffset GetUtcNow()
    {
        if (_queue.Count > 0)
            _last = _queue.Dequeue();
        return _last;
    }
}
