import React from 'react';
import { useModal } from '../context/ModalContext';
import '../index.css';

const Modal = () => {
  const { modal, closeModal } = useModal();

  if (!modal.isOpen) return null;

  const handleConfirm = async () => {
    try {
      await modal.onConfirm(); // Await the async callback
    } catch (err) {
      console.error('Modal confirm error:', err);
    } finally {
      closeModal(); // Always close the modal after confirm
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <p>{modal.message}</p>
        <div className="modal-buttons">
          {modal.isConfirm ? (
            <>
              <button onClick={handleConfirm} className="modal-confirm-btn">Confirm</button>
              <button onClick={closeModal} className="modal-cancel-btn">Cancel</button>
            </>
          ) : (
            <button onClick={closeModal} className="modal-close-btn">Close</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Modal;