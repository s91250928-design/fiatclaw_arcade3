import { redirect } from "next/navigation";

/**
 * Fallback: если middleware не сработал, уводим на лендинг.
 * Основной путь — middleware rewrite `/` → `/landing.html`.
 */
export default function HomePage() {
  redirect("/landing.html");
}
