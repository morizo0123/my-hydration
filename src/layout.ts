export function layout(content: string): string {
  return `
    <!DOCTYPE html>
      <head>
        <meta charset="UTF-8">
        <title>My Hydration App</title>
      </head>
      <body>
        <header>
          <nav>
            <a href="/">Home</a> | <a href="/about">About</a>
          </nav>
        </header>

        <main>
          ${content}
        </main>

        <footer>
          <small>&copy; 2026 My Hydration App</small>
        </footer>
        <script src="/client.js"></script>
      </body>
    </html>
  `;
}
