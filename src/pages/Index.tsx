import { SignInPage, RoleInfo } from "@/components/ui/sign-in";
import { useToast } from "@/hooks/use-toast";

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
      "Asigna tareas a los operarios",
      "Puede exportar o imprimir listado de responsables"
    ]
  },
  {
    role: "Supervisores / Líderes de bodega",
    features: [
      "Encargado de transcribir cantidades contadas físicas",
      "Puede exportar o imprimir listado de responsables"
    ]
  },
];

const Index = () => {
  const { toast } = useToast();

  const handleSignIn = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;
    
    toast({
      title: "Iniciando sesión...",
      description: `Verificando credenciales para ${email}`,
    });
  };

  const handleResetPassword = () => {
    toast({
      title: "Recuperar contraseña",
      description: "Te enviaremos un correo con las instrucciones.",
    });
  };

  const handleCreateAccount = () => {
    toast({
      title: "Crear cuenta",
      description: "Contacta al administrador para solicitar acceso.",
    });
  };

  return (
    <div className="h-[100dvh] w-[100dvw] overflow-hidden bg-background text-foreground">
      <SignInPage
        title={
          <>
            Bienvenido a{" "}
            <span className="gradient-text">Tercol</span>
          </>
        }
        description="Accede a tu cuenta para gestionar el inventario semestral 2026"
        heroImageSrc="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=2160&q=80"
        roles={roles}
        onSignIn={handleSignIn}
        onResetPassword={handleResetPassword}
        onCreateAccount={handleCreateAccount}
      />
    </div>
  );
};

export default Index;
