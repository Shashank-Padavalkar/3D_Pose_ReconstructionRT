export type HealthState = 'good' | 'warning' | 'error' | 'neutral';

export interface StatusItem {
  label: string;
  value: string;
  state?: HealthState;
  title?: string;
}

interface StatusBarProps {
  items: StatusItem[];
}

export function StatusBar({ items }: StatusBarProps) {
  return (
    <section className="status-bar" aria-label="System status">
      {items.map((item) => (
        <div className="status-item" key={item.label} title={item.title}>
          <span className={`status-dot ${item.state ?? 'neutral'}`} aria-hidden="true" />
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </section>
  );
}
