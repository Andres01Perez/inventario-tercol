import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface EditableCellProps {
  value: string | number | null | undefined;
  onSave: (value: string) => Promise<void>;
  type?: 'text' | 'number';
  className?: string;
  placeholder?: string;
}

const EditableCell: React.FC<EditableCellProps> = ({
  value,
  onSave,
  type = 'text',
  className,
  placeholder = 'Vacío'
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value ?? ''));
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(String(value ?? ''));
  }, [value]);

  const handleDoubleClick = () => {
    setIsEditing(true);
    setEditValue(String(value ?? ''));
  };

  const handleSave = async () => {
    if (editValue === String(value ?? '')) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onSave(editValue);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(String(value ?? ''));
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    handleSave();
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        type={type}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        disabled={isSaving}
        className={cn('h-8 text-sm', className)}
      />
    );
  }

  const displayValue = value ?? '';
  const isEmpty = displayValue === '' || displayValue === null || displayValue === undefined;

  return (
    <div
      onDoubleClick={handleDoubleClick}
      className={cn(
        'cursor-pointer px-2 py-1 rounded hover:bg-muted/50 min-h-[32px] flex items-center transition-colors',
        isEmpty && 'text-muted-foreground italic',
        className
      )}
      title="Doble clic para editar"
    >
      {isEmpty ? placeholder : String(displayValue)}
    </div>
  );
};

export default EditableCell;
