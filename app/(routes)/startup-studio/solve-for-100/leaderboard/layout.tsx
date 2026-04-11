export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fbfbee]">
      <header className="border-b bg-white px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <h1 className="text-xl font-bold text-[#0b6d41]">JKKN Institutions</h1>
          <span className="text-muted-foreground">|</span>
          <span className="text-lg font-semibold">Solve for 100</span>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
