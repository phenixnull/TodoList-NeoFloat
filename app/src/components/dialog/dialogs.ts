// Imperative dialog API, backed by a single <DialogHost /> mounted at the root.
// Replaces React Native's native Alert.alert so every popup matches the app theme.

export type DialogOption = {
  text: string;
  icon?: string; // Ionicons name
  iconColor?: string;
  selected?: boolean;
  danger?: boolean;
  onPress?: () => void;
};

export type AlertRequest = {
  kind: 'alert';
  title: string;
  message?: string;
  confirmText?: string;
};

export type ConfirmRequest = {
  kind: 'confirm';
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
};

export type SheetRequest = {
  kind: 'sheet';
  title: string;
  message?: string;
  options: DialogOption[];
  cancelText?: string;
};

export type DialogRequest = AlertRequest | ConfirmRequest | SheetRequest;

type Sink = (request: DialogRequest) => void;

let sink: Sink | null = null;
const pending: DialogRequest[] = [];

export function __registerDialogSink(next: Sink | null) {
  sink = next;
  if (next) {
    while (pending.length) next(pending.shift() as DialogRequest);
  }
}

function enqueue(request: DialogRequest) {
  if (sink) sink(request);
  else pending.push(request);
}

export const dialog = {
  alert(title: string, message?: string, confirmText?: string) {
    enqueue({ kind: 'alert', title, message, confirmText });
  },
  confirm(options: Omit<ConfirmRequest, 'kind'>) {
    enqueue({ kind: 'confirm', ...options });
  },
  sheet(options: Omit<SheetRequest, 'kind'>) {
    enqueue({ kind: 'sheet', ...options });
  },
};
