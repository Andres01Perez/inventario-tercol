import { SignInPage, Testimonial } from "@/components/ui/sign-in";
import { useToast } from "@/hooks/use-toast";

const testimonials: Testimonial[] = [
  {
    avatarSrc: "https://randomuser.me/api/portraits/women/44.jpg",
    name: "María González",
    handle: "@mgonzalez_tercol",
    text: "El sistema de inventario ha optimizado nuestros conteos. Ahora tardamos la mitad del tiempo."
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/32.jpg",
    name: "Carlos Rodríguez",
    handle: "@crodriguez_lider",
    text: "Como líder de bodega, la plataforma me permite coordinar mi equipo de manera eficiente."
  },
  {
    avatarSrc: "https://randomuser.me/api/portraits/men/67.jpg",
    name: "Andrés Martínez",
    handle: "@amartinez_admin",
    text: "La trazabilidad de los conteos y la validación en tiempo real son increíbles."
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
    <div className="bg-background text-foreground">
      <SignInPage
        title={
          <>
            Bienvenido a{" "}
            <span className="gradient-text">Tercol</span>
          </>
        }
        description="Accede a tu cuenta para gestionar el inventario semestral 2026"
        heroImageSrc="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=2160&q=80"
        testimonials={testimonials}
        onSignIn={handleSignIn}
        onResetPassword={handleResetPassword}
        onCreateAccount={handleCreateAccount}
      />
    </div>
  );
};

export default Index;
