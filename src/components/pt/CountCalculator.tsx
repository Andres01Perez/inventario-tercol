import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { Calculator } from 'lucide-react';

interface Props {
  /** Unidad de empaque de la ubicación (multiplicador precargado) */
  ue: number | null;
  referencia: string;
  onApply: (total: number) => void;
  disabled?: boolean;
}

const parseNumber = (raw: string): number => {
  if (!raw || raw.trim() === '') return 0;
  const n = parseFloat(raw.replace(',', '.'));
  return isNaN(n) ? 0 : n;
};

const formatTotal = (n: number): string => {
  // Evitar decimales flotantes feos: 3*15+3 = 48, no 48.0000001
  return String(Math.round(n * 1000) / 1000);
};

const CountCalculator: React.FC<Props> = ({ ue, referencia, onApply, disabled }) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [boxes, setBoxes] = useState('');
  const [multiplier, setMultiplier] = useState<string>(ue != null ? String(ue) : '');
  const [loose, setLoose] = useState('');

  const boxesNum = parseNumber(boxes);
  const multiplierNum = parseNumber(multiplier);
  const looseNum = parseNumber(loose);

  const boxesSubtotal = boxesNum * multiplierNum;
  const total = boxesSubtotal + looseNum;

  const hasInput = boxes.trim() !== '' || loose.trim() !== '';

  const breakdown = useMemo(() => {
    const parts: string[] = [];
    if (boxes.trim() !== '') parts.push(`${formatTotal(boxesNum)} × ${formatTotal(multiplierNum)} = ${formatTotal(boxesSubtotal)}`);
    if (loose.trim() !== '') parts.push(`+ ${formatTotal(looseNum)} sueltas`);
    return parts;
  }, [boxes, multiplier, loose, boxesNum, multiplierNum, boxesSubtotal, looseNum]);

  const reset = () => {
    setBoxes('');
    setLoose('');
    setMultiplier(ue != null ? String(ue) : '');
  };

  const handleApply = () => {
    onApply(total);
    setOpen(false);
    reset();
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const form = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="calc-boxes" className="text-sm font-medium">
          Cajas completas
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="calc-boxes"
            type="number"
            inputMode="decimal"
            enterKeyHint="next"
            min={0}
            className="h-12 text-base md:h-10 md:text-sm"
            placeholder="0"
            value={boxes}
            onChange={(e) => setBoxes(e.target.value)}
          />
          <span className="text-muted-foreground shrink-0">×</span>
          <Input
            id="calc-multiplier"
            type="number"
            inputMode="decimal"
            enterKeyHint="next"
            min={0}
            className="h-12 text-base md:h-10 md:text-sm w-24"
            placeholder="U.E."
            title="Unidad de empaque"
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {ue != null
            ? `U.E. precargada: ${ue} unidades por caja (editable)`
            : 'Esta ubicación no tiene U.E. registrada; escribe el multiplicador (o 1 si no aplica)'}
        </p>
        {boxes.trim() !== '' && (
          <p className="text-sm">
            {formatTotal(boxesNum)} cajas × {formatTotal(multiplierNum)} ={' '}
            <span className="font-semibold">{formatTotal(boxesSubtotal)}</span>
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="calc-loose" className="text-sm font-medium">
          Unidades sueltas
        </Label>
        <Input
          id="calc-loose"
          type="number"
          inputMode="decimal"
          enterKeyHint="done"
          min={0}
          className="h-12 text-base md:h-10 md:text-sm"
          placeholder="0"
          value={loose}
          onChange={(e) => setLoose(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hasInput) handleApply();
          }}
        />
      </div>

      <div className="rounded-md border bg-muted/50 p-3 text-center space-y-1">
        <p className="text-xs text-muted-foreground">Total</p>
        <p className="text-2xl font-bold tabular-nums">{hasInput ? formatTotal(total) : '—'}</p>
        {breakdown.length > 0 && (
          <p className="text-xs text-muted-foreground">{breakdown.join('  ·  ')}</p>
        )}
      </div>

      <Button
        className="w-full h-12 text-base md:h-10 md:text-sm"
        onClick={handleApply}
        disabled={!hasInput}
      >
        Usar {hasInput ? formatTotal(total) : 'total'}
      </Button>
    </div>
  );

  const trigger = (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="h-12 w-12 shrink-0 md:h-10 md:w-10"
      disabled={disabled}
      aria-label={`Calculadora para ${referencia}`}
    >
      <Calculator className="h-5 w-5" />
    </Button>
  );

  if (isMobile) {
    return (
      <>
        <span onClick={() => !disabled && setOpen(true)}>{trigger}</span>
        <Sheet open={open} onOpenChange={handleOpenChange}>
          <SheetContent side="bottom" className="rounded-t-xl">
            <SheetHeader className="pb-3">
              <SheetTitle className="text-left">
                Calculadora · <span className="text-muted-foreground font-normal break-all">{referencia}</span>
              </SheetTitle>
            </SheetHeader>
            {form}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <p className="text-sm font-medium mb-3 break-all">
          Calculadora · <span className="text-muted-foreground font-normal">{referencia}</span>
        </p>
        {form}
      </PopoverContent>
    </Popover>
  );
};

export default CountCalculator;
