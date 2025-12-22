import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface RoleCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  permissions: string[];
  delay?: number;
}

const RoleCard = ({ title, description, icon: Icon, permissions, delay = 0 }: RoleCardProps) => {
  return (
    <div 
      className={cn(
        "glass-card-interactive group cursor-pointer animate-slide-up",
        "border border-border/50 hover:border-primary/30"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors duration-300">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-border/50">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Permisos
        </p>
        <ul className="space-y-1.5">
          {permissions.map((permission, index) => (
            <li key={index} className="flex items-center gap-2 text-sm text-foreground/80">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
              {permission}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default RoleCard;
