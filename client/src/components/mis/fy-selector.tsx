import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FYSelectorProps {
  value: string;
  onChange: (fy: string) => void;
}

const FY_PATTERN = /^\d{4}-\d{2}$/;

function generateFYOptions(currentValue?: string): { value: string; label: string }[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentFYStart = currentMonth >= 3 ? currentYear : currentYear - 1;
  const options: { value: string; label: string }[] = [];
  for (let y = currentFYStart; y >= currentFYStart - 4; y--) {
    const shortEnd = String(y + 1).slice(-2);
    options.push({
      value: `${y}-${shortEnd}`,
      label: `FY ${y}-${shortEnd}`,
    });
  }
  if (
    currentValue &&
    FY_PATTERN.test(currentValue) &&
    !options.some((o) => o.value === currentValue)
  ) {
    options.push({
      value: currentValue,
      label: `FY ${currentValue}`,
    });
    options.sort((a, b) => {
      const aY = parseInt(a.value.split("-")[0], 10);
      const bY = parseInt(b.value.split("-")[0], 10);
      return bY - aY;
    });
  }
  return options;
}

export function FYSelector({ value, onChange }: FYSelectorProps) {
  const safeValue = FY_PATTERN.test(value) ? value : getCurrentFY();
  const options = generateFYOptions(safeValue);

  return (
    <Select value={safeValue} onValueChange={onChange}>
      <SelectTrigger className="w-[160px] h-9 text-sm font-medium bg-card border-border">
        <SelectValue placeholder="Select FY" />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function getCurrentFY(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const fyStart = month >= 3 ? year : year - 1;
  return `${fyStart}-${String(fyStart + 1).slice(-2)}`;
}

export function isCurrentFY(fy: string): boolean {
  return fy === getCurrentFY();
}

export function getCurrentFYMonthIndex(): number {
  const now = new Date();
  const m = now.getMonth(); // 0-based
  return m >= 3 ? m - 3 : m + 9;
}
