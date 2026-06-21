const SchedulerStatusCard = () => {
  const mockData = {
    lastRun: 'N/A',
    nextRun: 'N/A',
    status: 'Disabled'
  };

  return (
    <div className="rounded-2xl shadow-md bg-white p-5">
      <h2 className="text-lg font-semibold mb-3">Scheduler Status</h2>
      <p><strong>Status:</strong> {mockData.status}</p>
      <p><strong>Last Run:</strong> {mockData.lastRun}</p>
      <p><strong>Next Run:</strong> {mockData.nextRun}</p>
    </div>
  );
};

export default SchedulerStatusCard;