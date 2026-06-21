const AuditLogPanel = () => {
  const logs = [
    { time: '2025-05-03 14:01', actor: 'admin1', action: 'Issued certificate for CN=example.com' },
    { time: '2025-05-03 13:59', actor: 'admin2', action: 'Updated signing profile "default-rsa"' }
  ];

  return (
    <div className="rounded-2xl shadow-md bg-white p-5">
      <h2 className="text-lg font-semibold mb-3">Recent Audit Logs</h2>
      <ul className="space-y-1 list-disc list-inside">
        {logs.map((log, index) => (
          <li key={index}>
            [{log.time}] <strong>{log.actor}</strong>: {log.action}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AuditLogPanel;