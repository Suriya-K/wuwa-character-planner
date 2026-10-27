export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <form method="post" action="/api/login">
      <fieldset>
        <legend>Login</legend>
        {error && <p className="error">Wrong password.</p>}
        <input type="password" name="password" autoFocus required /> <button type="submit">Enter</button>
      </fieldset>
    </form>
  );
}
