// Outils communs aux formulaires de demande (contact, devis, conseil, commande).
import { postJSON } from '../modules/ui.js';

/** Lit les champs « client » d'un formulaire. */
export function customerFrom(form) {
  const f = new FormData(form);
  return {
    name: f.get('name') || '',
    phone: f.get('phone') || '',
    email: f.get('email') || '',
    city: f.get('city') || '',
    contactPref: f.get('contactPref') || 'whatsapp',
  };
}

export function validateCustomer(c) {
  if (!c.name.trim()) return 'Merci d’indiquer votre nom.';
  if (!c.phone.trim() && !c.email.trim()) return 'Indiquez un numéro WhatsApp / téléphone ou un e-mail pour que Fany puisse vous répondre.';
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return 'Adresse e-mail invalide.';
  return '';
}

/** Envoie une demande et affiche la confirmation. */
export async function submitRequest({ form, payload, button, errorEl, success, waBase }) {
  errorEl.textContent = '';
  const problem = validateCustomer(payload.customer);
  if (problem) { errorEl.textContent = problem; return null; }
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Envoi…';
  try {
    const res = await postJSON('/api/requests', { ...payload, website: new FormData(form).get('website') || '' });
    form.closest('[data-contact], [data-order]')?.querySelectorAll('[data-panel], .tabs, .steps, form').forEach((el) => { el.hidden = true; });
    form.hidden = true;
    success.hidden = false;
    success.querySelector('[data-reference]').textContent = res.reference || '';
    const wa = success.querySelector('[data-success-wa]');
    if (wa && waBase) {
      const text = `Bonjour Fany, je viens d’envoyer une demande sur le site (référence ${res.reference}).`;
      wa.href = `${waBase.split('?')[0]}?text=${encodeURIComponent(text)}`;
    }
    success.focus();
    success.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return res;
  } catch (err) {
    errorEl.textContent = err.message;
    return null;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}
