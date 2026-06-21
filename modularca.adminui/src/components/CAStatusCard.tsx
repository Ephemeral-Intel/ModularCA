const CAStatusCard = () => {
  const mockData = {
    uptime: '3d 14h',
    profile: 'default-rsa',
    issued: 241,
    status: 'Healthy'
  };

  return (
    <div className="rounded-2xl shadow-md bg-white p-5">
      <h2 className="text-lg font-semibold mb-3">CA Status</h2>
      <p><strong>Status:</strong> {mockData.status}</p>
      <p><strong>Uptime:</strong> {mockData.uptime}</p>
      <p><strong>Profile:</strong> {mockData.profile}</p>
      <p><strong>Certs Issued:</strong> {mockData.issued}</p>
    </div>
  );
};

export default CAStatusCard;