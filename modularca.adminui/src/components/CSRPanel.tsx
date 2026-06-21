const CSRPanel = () => {
  const csrs = [
    { id: 1, subject: 'CN=standby.com', createdAt: '2025-05-03 13:45', profile: 'default-rsa' },
    { id: 2, subject: 'CN=pending.org', createdAt: '2025-05-03 13:50', profile: 'web-ecdsa' }
  ];

  return (
    <div className="rounded-2xl shadow-md bg-white p-5">
      <h2 className="text-lg font-semibold mb-3">Pending CSRs</h2>
      <ul className="list-disc list-inside space-y-1">
        {csrs.map((csr) => (
          <li key={csr.id}>
            <strong>{csr.subject}</strong> – {csr.profile} <span className="text-sm text-gray-600">({csr.createdAt})</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CSRPanel;