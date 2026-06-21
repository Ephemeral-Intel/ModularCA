const HealthCheckPanel = () => {
  const health = {
    keyLoaded: true,
    dbConnected: true,
    configSynced: true
  };

  return (
    <div className="rounded-2xl shadow-md bg-white p-5">
      <h2 className="text-lg font-semibold mb-3">CA Health Check</h2>
      <ul className="list-disc list-inside space-y-1">
        <li>Signing Key Loaded: {health.keyLoaded ? '✅' : '❌'}</li>
        <li>DB Connected: {health.dbConnected ? '✅' : '❌'}</li>
        <li>Config Synced: {health.configSynced ? '✅' : '❌'}</li>
      </ul>
    </div>
  );
};

export default HealthCheckPanel;