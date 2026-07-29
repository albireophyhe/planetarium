type SwitchProps = {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};

export function Switch({ checked, label, onChange }: SwitchProps) {
  return (
    <label className="switch-row">
      <span>{label}</span>
      <span className="switch">
        <input
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span aria-hidden="true" className="switch__track">
          <span className="switch__thumb" />
        </span>
      </span>
    </label>
  );
}
