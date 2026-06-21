const LoggedInAdminsPanel = () => {
  const admins = [
    { username: 'admin1', lastSeen: '2025-05-03 13:59' },
    { username: 'admin2', lastSeen: '2025-05-03 13:55' }
  ];

  return (
    <div className="rounded-2xl shadow-md bg-white p-5">
      <h2 className="text-lg font-semibold mb-3">Logged-in Admins</h2>
      <ul className="list-disc list-inside space-y-1">
        {admins.map((admin, index) => (
          <li key={index}>
            {admin.username} <span className="text-sm text-gray-600">(last seen: {admin.lastSeen})</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LoggedInAdminsPanel;