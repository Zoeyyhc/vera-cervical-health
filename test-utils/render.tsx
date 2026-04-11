import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";

/**
 * Custom render that wraps components in app-wide providers.
 * Add providers here as needed (Zustand, theme, etc.).
 */
function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function customRender(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: Providers, ...options });
}

// Re-export everything from RTL, override render
export * from "@testing-library/react";
export { customRender as render };
