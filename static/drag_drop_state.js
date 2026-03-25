export function createDragDropController({
  surface,
  mode,
  dragThresholdPx,
}) {
  function bindPinDrag(pin, {
    setActivePin,
    setDragHalo,
    applyDistanceStyle,
    savePin,
  }) {
    pin.addEventListener('pointerdown', (event) => {
      if (pin.dataset.state === 'completed' || pin.dataset.transitioning === 'true') return;
      setActivePin(pin);

      const rect = pin.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      const startX = event.clientX;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      let dragging = false;
      let pointerCaptured = false;
      let ended = false;

      const cleanup = () => {
        if (ended) return;
        ended = true;
        pin.removeEventListener('pointermove', onMove);
        pin.removeEventListener('pointerup', onUp);
        pin.removeEventListener('pointercancel', onUp);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('lostpointercapture', onUp);
      };

      const onMove = (moveEvent) => {
        const dist = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
        if (!dragging && dist < dragThresholdPx) return;
        if (!dragging) {
          dragging = true;
          pin.classList.add('dragging');
          try {
            pin.setPointerCapture(pointerId);
            pointerCaptured = true;
          } catch (_err) {}
          if (mode === 'focus') setDragHalo(true);
          if (document.activeElement && pin.contains(document.activeElement)) document.activeElement.blur();
        }

        const width = pin.offsetWidth || rect.width;
        const height = pin.offsetHeight || rect.height;
        const x = moveEvent.clientX - surfaceRect.left - offsetX;
        const y = moveEvent.clientY - surfaceRect.top - offsetY;
        pin.style.left = `${Math.max(6, Math.min(surface.clientWidth - width - 6, x))}px`;
        pin.style.top = `${Math.max(6, Math.min(surface.clientHeight - height - 6, y))}px`;
        applyDistanceStyle(pin);
        pin.style.display = '';
      };

      const onUp = (upEvent) => {
        cleanup();
        if (!dragging) return;

        pin.classList.remove('dragging');
        if (pointerCaptured && pin.hasPointerCapture(upEvent.pointerId)) {
          try {
            pin.releasePointerCapture(upEvent.pointerId);
          } catch (_err) {}
        }
        if (mode === 'focus') setDragHalo(false);
        applyDistanceStyle(pin);
        savePin(pin);
      };

      pin.addEventListener('pointermove', onMove);
      pin.addEventListener('pointerup', onUp);
      pin.addEventListener('pointercancel', onUp);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      window.addEventListener('lostpointercapture', onUp);
    });
  }

  function bindSurfaceInteractions(hiddenTrayState, {
    surface,
    setDragHalo,
    getCanvasViewportRect,
    createPin,
    showCanvasWarning,
    showResurfaceAck,
  }) {
    surface.addEventListener('dragover', (event) => {
      hiddenTrayState.handleSurfaceDragOver(event, {setDragHalo});
    });

    surface.addEventListener('dragleave', (event) => {
      hiddenTrayState.handleSurfaceDragLeave(event, {surface, setDragHalo});
    });

    surface.addEventListener('drop', (event) => {
      void hiddenTrayState.handleSurfaceDrop(event, {
        surface,
        setDragHalo,
        getCanvasViewportRect,
        createPin,
        showCanvasWarning,
        showResurfaceAck,
      });
    });
  }

  return {
    bindPinDrag,
    bindSurfaceInteractions,
  };
}
