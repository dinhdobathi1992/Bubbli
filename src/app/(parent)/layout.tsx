/**
 * The guardian's instrument.
 *
 * Explicit rather than inherited. The guardian register is also what `:root`
 * declares, so this layout changes nothing today — it exists so the register is
 * stated at the surface instead of being an accident of the default, and so
 * moving the default later cannot silently move this surface with it.
 *
 * This one DOES follow `prefers-color-scheme`: a guardian reading a dashboard
 * at 11pm has the opposite need to a child.
 */
export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-register="guardian" className="min-h-dvh bg-ground text-ink">
      {children}
    </div>
  );
}
