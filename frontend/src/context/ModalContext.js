import React, { createContext, useState, useContext } from 'react';

const ModalContext = createContext();

export const ModalProvider = ({ children }) => {
  const [modal, setModal] = useState({ isOpen: false, message: '', isConfirm: false, onConfirm: null });

  const showModal = (message, isConfirm = false, onConfirm = null) => {
    setModal({ isOpen: true, message, isConfirm, onConfirm });
  };

  const closeModal = () => {
    setModal({ isOpen: false, message: '', isConfirm: false, onConfirm: null });
  };

  return (
    <ModalContext.Provider value={{ modal, showModal, closeModal }}>
      {children}
    </ModalContext.Provider>
  );
};

export const useModal = () => useContext(ModalContext);