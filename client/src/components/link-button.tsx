import { useLocation } from "wouter";
import { Button, ButtonProps } from "@/components/ui/button";

interface LinkButtonProps extends ButtonProps {
  href: string;
}

export function LinkButton({ href, children, onClick, ...props }: LinkButtonProps) {
  const [, setLocation] = useLocation();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick(e);
    }
    if (!e.defaultPrevented) {
      setLocation(href);
    }
  };

  return (
    <Button onClick={handleClick} {...props}>
      {children}
    </Button>
  );
}
