import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Package, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

const EMAIL_DOMAIN = '@tercol.com.co';
const usernameSchema = z.string()
  .min(3, 'El usuario debe tener al menos 3 caracteres')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Solo letras, números, puntos y guiones');
const passwordSchema = z.string().min(6, 'La contraseña debe tener al menos 6 caracteres');
const fullNameSchema = z.string().min(2, 'El nombre debe tener al menos 2 caracteres');

interface GlassInputWrapperProps {
  children: React.ReactNode;
  error?: boolean;
}

const GlassInputWrapper = React.forwardRef<HTMLDivElement, GlassInputWrapperProps>(
  ({ children, error }, ref) => (
    <div 
      ref={ref}
      className={`rounded-2xl border ${error ? 'border-destructive' : 'border-border'} bg-foreground/5 backdrop-blur-sm transition-colors focus-within:border-primary/70 focus-within:bg-primary/10`}
    >
      {children}
    </div>
  )
);
GlassInputWrapper.displayName = 'GlassInputWrapper';

interface RoleInfo {
  role: string;
  features: string[];
}

const roles: RoleInfo[] = [
  {
    role: "Superadmin",
    features: [
      "Carga la data maestra",
      "Tiene visión global",
      "Valida los ajustes finales y define tolerancias"
    ]
  },
  {
    role: "Administradores",
    features: [
      "Asigna ubicaciones específicas a los Supervisores",
      "Gestiona el proceso de conteo físico",
      "Puede exportar o imprimir listado de responsables"
    ]
  },
  {
    role: "Supervisores/Líderes de bodega",
    features: [
      "Encargado de transcribir cantidades contadas físicas",
      "Puede exportar o imprimir listado de responsables"
    ]
  }
];

interface RoleCardProps {
  role: RoleInfo;
  delay: string;
}

const RoleCard = React.forwardRef<HTMLDivElement, RoleCardProps>(
  ({ role, delay }, ref) => (
    <div 
      ref={ref}
      className={`animate-testimonial ${delay} rounded-2xl bg-card/40 backdrop-blur-xl border border-white/10 p-4 w-72`}
    >
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
  )
);
RoleCard.displayName = 'RoleCard';

const Auth: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: '',
  });
  const [errors, setErrors] = useState<{
    username?: string;
    password?: string;
    fullName?: string;
  }>({});

  const { signIn, signUp, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (!loading && user) {
      navigate(from, { replace: true });
    }
  }, [user, loading, navigate, from]);

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    const usernameResult = usernameSchema.safeParse(formData.username);
    if (!usernameResult.success) {
      newErrors.username = usernameResult.error.errors[0].message;
    }

    const passwordResult = passwordSchema.safeParse(formData.password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }

    if (isSignUp) {
      const fullNameResult = fullNameSchema.safeParse(formData.fullName);
      if (!fullNameResult.success) {
        newErrors.fullName = fullNameResult.error.errors[0].message;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const fullEmail = `${formData.username.toLowerCase().trim()}${EMAIL_DOMAIN}`;
      
      if (isSignUp) {
        const { error } = await signUp(fullEmail, formData.password, formData.fullName);
        if (error) {
          if (error.message.includes('already registered')) {
            toast({
              title: 'Usuario ya registrado',
              description: 'Este correo ya está registrado. Intenta iniciar sesión.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Error al registrarse',
              description: error.message,
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: 'Registro exitoso',
            description: 'Revisa tu correo para confirmar tu cuenta.',
          });
          setIsSignUp(false);
        }
      } else {
        const { error } = await signIn(fullEmail, formData.password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            toast({
              title: 'Credenciales inválidas',
              description: 'El correo o la contraseña son incorrectos.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Error al iniciar sesión',
              description: error.message,
              variant: 'destructive',
            });
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name as keyof typeof errors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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

            <h1 className="animate-element animate-delay-200 text-4xl md:text-5xl font-semibold leading-tight">
              <span className="font-light text-foreground tracking-tighter">
                {isSignUp ? 'Crear Cuenta' : 'Bienvenido'}
              </span>
            </h1>
            <p className="animate-element animate-delay-300 text-muted-foreground">
              {isSignUp 
                ? 'Completa tus datos para registrarte' 
                : 'Accede a tu cuenta para gestionar el inventario'}
            </p>

            <form className="space-y-4" onSubmit={handleSubmit}>
              {isSignUp && (
                <div className="animate-element animate-delay-350">
                  <label className="text-sm font-medium text-muted-foreground">Nombre Completo</label>
                  <GlassInputWrapper error={!!errors.fullName}>
                    <input
                      name="fullName"
                      type="text"
                      placeholder="Tu nombre completo"
                      value={formData.fullName}
                      onChange={handleInputChange}
                      className="w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none text-foreground placeholder:text-muted-foreground"
                    />
                  </GlassInputWrapper>
                  {errors.fullName && (
                    <p className="text-xs text-destructive mt-1">{errors.fullName}</p>
                  )}
                </div>
              )}

              <div className="animate-element animate-delay-400">
                <label className="text-sm font-medium text-muted-foreground">Usuario</label>
                <GlassInputWrapper error={!!errors.username}>
                  <div className="flex items-center">
                    <input
                      name="username"
                      type="text"
                      placeholder="tu.usuario"
                      value={formData.username}
                      onChange={handleInputChange}
                      className="flex-1 bg-transparent text-sm p-4 rounded-l-2xl focus:outline-none text-foreground placeholder:text-muted-foreground"
                    />
                    <span className="px-4 py-2 text-sm font-semibold whitespace-nowrap bg-primary/10 text-primary rounded-r-xl border-l border-primary/20">
                      @tercol.com.co
                    </span>
                  </div>
                </GlassInputWrapper>
                {errors.username && (
                  <p className="text-xs text-destructive mt-1">{errors.username}</p>
                )}
              </div>

              <div className="animate-element animate-delay-500">
                <label className="text-sm font-medium text-muted-foreground">Contraseña</label>
                <GlassInputWrapper error={!!errors.password}>
                  <div className="relative">
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Ingresa tu contraseña"
                      value={formData.password}
                      onChange={handleInputChange}
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
                {errors.password && (
                  <p className="text-xs text-destructive mt-1">{errors.password}</p>
                )}
              </div>

              {!isSignUp && (
                <div className="animate-element animate-delay-600 flex items-center justify-between text-sm">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" name="rememberMe" className="custom-checkbox" />
                    <span className="text-foreground/90">Mantener sesión iniciada</span>
                  </label>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="animate-element animate-delay-700 w-full rounded-2xl gradient-bg py-4 font-medium text-primary-foreground hover:opacity-90 transition-all shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {isSignUp ? 'Registrando...' : 'Iniciando sesión...'}
                  </>
                ) : (
                  isSignUp ? 'Crear Cuenta' : 'Iniciar Sesión'
                )}
              </button>
            </form>

            <p className="animate-element animate-delay-800 text-center text-sm text-muted-foreground">
              {isSignUp ? (
                <>
                  ¿Ya tienes cuenta?{' '}
                  <button
                    onClick={() => setIsSignUp(false)}
                    className="text-primary hover:underline transition-colors"
                  >
                    Iniciar Sesión
                  </button>
                </>
              ) : (
                <>
                  ¿Nuevo en la plataforma?{' '}
                  <button
                    onClick={() => setIsSignUp(true)}
                    className="text-primary hover:underline transition-colors"
                  >
                    Crear Cuenta
                  </button>
                </>
              )}
            </p>

            <div className="animate-element animate-delay-900 pt-2 border-t border-border/50 text-center">
              <p className="text-xs text-muted-foreground">
                © 2026 Tercol SAS. Todos los derechos reservados.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Right column: hero image + role cards */}
      <section className="hidden md:block flex-1 relative p-3 overflow-hidden">
        <div
          className="animate-slide-right animate-delay-300 absolute inset-3 rounded-3xl bg-cover bg-center"
          style={{ backgroundImage: `url(https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=2070)` }}
        >
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        </div>

        <div className="absolute bottom-4 left-4 right-4 flex gap-2 justify-center flex-wrap z-10">
          {roles.map((role, idx) => (
            <RoleCard
              key={role.role}
              role={role}
              delay={`animate-delay-${1000 + idx * 200}`}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

export default Auth;
