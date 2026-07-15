export const demoUsers = [
  { id: "admin-1", email: "admin@bus.local", password: "admin123", role: "ADMIN", name: "Admin Demo", savedPassengers: [] },
  { id: "staff-1", email: "staff@bus.local", password: "staff123", role: "STAFF", name: "Check-in Staff", savedPassengers: [] },
  {
    id: "customer-1",
    email: "customer@bus.local",
    password: "customer123",
    role: "CUSTOMER",
    name: "Customer Demo",
    savedPassengers: [
      {
        id: "passenger-1",
        fullName: "Nguyễn Văn An",
        phone: "0909000000",
        email: "customer@bus.local",
        documentId: "CCCD001"
      }
    ]
  }
];
