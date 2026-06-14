export default function Page() {
  const studentCount = 5; // identifier — must NOT flag
  return (
    <div>
      <h1>Welcome students to the faculty dashboard</h1>
      <p>Track exam grades for every learner here.</p>
      <button onClick={() => studentCount}>Open</button>
    </div>
  );
}
