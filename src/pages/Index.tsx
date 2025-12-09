import { ShieldCheck, UserCog, Warehouse, Package } from "lucide-react";
import RoleCard from "@/components/auth/RoleCard";
import AuthForm from "@/components/auth/AuthForm";

const roles = [
  {
    title: "SuperAdmin",
    description: "Control total del sistema y configuración global del inventario.",
    icon: ShieldCheck,
    permissions: [
      "Gestión completa de usuarios",
      "Configuración del sistema",
      "Reportes globales",
      "Auditoría de acciones",
    ],
  },
  {
    title: "Administrador",
    description: "Gestión de equipos, asignación de tareas y supervisión del proceso.",
    icon: UserCog,
    permissions: [
      "Crear y asignar tareas",
      "Gestionar líderes de bodega",
      "Validar conteos",
      "Generar reportes",
    ],
  },
  {
    title: "Líder de Bodega",
    description: "Coordinación del equipo de conteo y digitación de inventario.",
    icon: Warehouse,
    permissions: [
      "Ejecutar conteos asignados",
      "Digitar resultados",
      "Reportar discrepancias",
      "Gestionar su equipo",
    ],
  },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-to-br from-primary/3 via-transparent to-transparent" />
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center shadow-lg shadow-primary/25">
              <Package className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Tercol SAS</h1>
              <p className="text-xs text-muted-foreground">Inventario 2026</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            {/* Left side - Role cards */}
            <div className="space-y-6">
              <div className="space-y-3 animate-fade-in">
                <h2 className="text-3xl lg:text-4xl font-bold text-foreground">
                  Sistema de{" "}
                  <span className="gradient-text">Gestión de Inventario</span>
                </h2>
                <p className="text-muted-foreground text-lg max-w-md">
                  Plataforma centralizada para el control y seguimiento del inventario semestral.
                </p>
              </div>

              <div className="space-y-4 pt-4">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Roles del Sistema
                </p>
                <div className="space-y-4">
                  {roles.map((role, index) => (
                    <RoleCard
                      key={role.title}
                      title={role.title}
                      description={role.description}
                      icon={role.icon}
                      permissions={role.permissions}
                      delay={index * 100}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Right side - Auth form */}
            <div className="lg:sticky lg:top-8">
              <div className="glass-card p-8 lg:p-10 border border-border/50">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 rounded-2xl gradient-bg flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/25 animate-float">
                    <Package className="w-8 h-8 text-primary-foreground" />
                  </div>
                  <h3 className="text-2xl font-bold text-foreground">Bienvenido</h3>
                  <p className="text-muted-foreground mt-2">
                    Accede a tu cuenta para continuar
                  </p>
                </div>

                <AuthForm />

                <div className="mt-8 pt-6 border-t border-border/50 text-center">
                  <p className="text-xs text-muted-foreground">
                    Al continuar, aceptas los{" "}
                    <button className="text-primary hover:underline">términos de servicio</button>
                    {" "}y{" "}
                    <button className="text-primary hover:underline">políticas de privacidad</button>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-6 mt-8">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-sm text-muted-foreground">
            © 2026 Tercol SAS. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
