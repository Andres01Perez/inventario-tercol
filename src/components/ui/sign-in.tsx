import React, { useState } from 'react';
import { Eye, EyeOff, Package } from 'lucide-react';

// --- TYPE DEFINITIONS ---

export interface RoleInfo {
  role: string;
  features: string[];
}

interface SignInPageProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  heroImageSrc?: string;
  roles?: RoleInfo[];
  onSignIn?: (event: React.FormEvent<HTMLFormElement>) => void;
  onResetPassword?: () => void;
  onCreateAccount?: () => void;
}

// --- SUB-COMPONENTS ---

const GlassInputWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-border bg-foreground/5 backdrop-blur-sm transition-colors focus-within:border-primary/70 focus-within:bg-primary/10">
    {children}
  </div>
);

const RoleCard = ({ role, delay }: { role: RoleInfo, delay: string }) => (
  <div className={`animate-testimonial ${delay} rounded-2xl bg-card/40 backdrop-blur-xl border border-white/10 p-4 w-72`}>
    <p className="font-semibold text-white text-sm mb-2">{role.role}</p>
    <ul className="space-y-1">
      {role.features.map((feature, idx) => (
        <li key={idx} className="flex items-start gap-2 text-xs text-white/85">
          <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
          {feature}
        </li>
      ))}
    </ul>
  </div>
);

// --- MAIN COMPONENT ---

export const SignInPage: React.FC<SignInPageProps> = ({
  title = <span className="font-light text-foreground tracking-tighter">Bienvenido</span>,
  description = "Accede a tu cuenta para gestionar el inventario",
  heroImageSrc,
  roles = [],
  onSignIn,
  onResetPassword,
  onCreateAccount,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="h-[100dvh] w-[100dvw] overflow-hidden flex flex-col md:flex-row font-sans">
      {/* Left column: sign-in form */}
      <section className="flex-1 flex items-center justify-center p-4 md:p-6 bg-background overflow-hidden">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-4">
            {/* Logo */}
            <div className="animate-element animate-delay-100 flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl gradient-bg flex items-center justify-center shadow-lg shadow-primary/25">
                <Package className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">Tercol SAS</h2>
                <p className="text-xs text-muted-foreground">Inventario 2026</p>
              </div>
            </div>

            <h1 className="animate-element animate-delay-200 text-4xl md:text-5xl font-semibold leading-tight">{title}</h1>
            <p className="animate-element animate-delay-300 text-muted-foreground">{description}</p>

            <form className="space-y-4" onSubmit={onSignIn}>
              <div className="animate-element animate-delay-400">
                <label className="text-sm font-medium text-muted-foreground">Correo Electrónico</label>
                <GlassInputWrapper>
                  <input 
                    name="email" 
                    type="email" 
                    placeholder="usuario@tercol.com" 
                    className="w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none text-foreground placeholder:text-muted-foreground" 
                  />
                </GlassInputWrapper>
              </div>

              <div className="animate-element animate-delay-500">
                <label className="text-sm font-medium text-muted-foreground">Contraseña</label>
                <GlassInputWrapper>
                  <div className="relative">
                    <input 
                      name="password" 
                      type={showPassword ? 'text' : 'password'} 
                      placeholder="Ingresa tu contraseña" 
                      className="w-full bg-transparent text-sm p-4 pr-12 rounded-2xl focus:outline-none text-foreground placeholder:text-muted-foreground" 
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)} 
                      className="absolute inset-y-0 right-3 flex items-center"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
                      ) : (
                        <Eye className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors" />
                      )}
                    </button>
                  </div>
                </GlassInputWrapper>
              </div>

              <div className="animate-element animate-delay-600 flex items-center justify-between text-sm">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" name="rememberMe" className="custom-checkbox" />
                  <span className="text-foreground/90">Mantener sesión iniciada</span>
                </label>
                <button 
                  type="button"
                  onClick={onResetPassword}
                  className="hover:underline text-primary transition-colors"
                >
                  Recuperar contraseña
                </button>
              </div>

              <button 
                type="submit" 
                className="animate-element animate-delay-700 w-full rounded-2xl gradient-bg py-4 font-medium text-primary-foreground hover:opacity-90 transition-all shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5"
              >
                Iniciar Sesión
              </button>
            </form>

            <p className="animate-element animate-delay-800 text-center text-sm text-muted-foreground">
              ¿Nuevo en la plataforma?{' '}
              <button 
                onClick={onCreateAccount}
                className="text-primary hover:underline transition-colors"
              >
                Crear Cuenta
              </button>
            </p>

            <div className="animate-element animate-delay-900 pt-2 border-t border-border/50 text-center">
              <p className="text-xs text-muted-foreground">
                © 2026 Tercol SAS. Todos los derechos reservados.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Right column: hero image + testimonials */}
      {heroImageSrc && (
        <section className="hidden md:block flex-1 relative p-3 overflow-hidden">
          <div 
            className="animate-slide-right animate-delay-300 absolute inset-3 rounded-3xl bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImageSrc})` }}
          >
            {/* Overlay gradient */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          </div>
          
          {roles.length > 0 && (
            <div className="absolute bottom-4 left-4 right-4 flex gap-2 justify-center flex-wrap z-10">
              {roles.map((role, idx) => (
                <RoleCard 
                  key={role.role} 
                  role={role} 
                  delay={`animate-delay-${1000 + idx * 200}`} 
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
