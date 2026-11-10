import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';

export default function RecipePhoto({ recipe, upload, busy, imageUrl }) {
  const picker = useRef(null);
  const mobileCamera = useRef(null);
  const video = useRef(null);
  const stream = useRef(null);
  const request = useRef(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState('');

  function stopCamera() {
    request.current++;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    setCameraOpen(false);
    setCameraReady(false);
  }
  useEffect(() => () => {
    request.current++;
    stream.current?.getTracks().forEach(track => track.stop());
  }, []);
  async function takePicture() {
    setError('');
    if (window.matchMedia('(pointer: coarse)').matches) {
      mobileCamera.current.click();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access needs HTTPS or localhost. You can still upload a picture.');
      return;
    }
    const token = ++request.current;
    setCameraOpen(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (token !== request.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      video.current.srcObject = media;
      await video.current.play();
      if (token === request.current) setCameraReady(true);
    } catch {
      if (token !== request.current) return;
      stopCamera();
      setError('Could not open the camera. Check camera permissions or upload a picture instead.');
    }
  }
  async function capture() {
    const camera = video.current;
    if (!camera?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = camera.videoWidth;
    canvas.height = camera.videoHeight;
    canvas.getContext('2d').drawImage(camera, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
    if (!blob) { setError('Could not capture a picture. Please try again.'); return; }
    stopCamera();
    await upload(new File([blob], 'recipe-photo.jpg', { type: 'image/jpeg' }), 'recipes', recipe.id);
  }
  function picked(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (file) { setError(''); upload(file, 'recipes', recipe.id); }
  }
  return <section className="recipe-photo-controls" aria-label="Recipe picture">
    {recipe.image && <img className="recipe-photo-preview" src={imageUrl(recipe.image)} alt={recipe.name}/>}
    <div className="row">
      <button type="button" className="secondary" disabled={busy || cameraOpen} onClick={() => picker.current.click()}><ImagePlus size={17}/>{recipe.image ? 'Change picture' : 'Add picture'}</button>
      <button type="button" className="secondary" disabled={busy || cameraOpen} onClick={takePicture}><Camera size={17}/>Take picture</button>
    </div>
    <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={picked}/>
    <input ref={mobileCamera} type="file" accept="image/*" capture="environment" hidden onChange={picked}/>
    {cameraOpen && <div className="recipe-camera"><video ref={video} autoPlay muted playsInline aria-label="Camera preview"/><div className="row"><button type="button" disabled={!cameraReady || busy} onClick={capture}><Camera size={17}/>Capture picture</button><button type="button" className="secondary" onClick={stopCamera}><X size={17}/>Cancel</button></div></div>}
    {error && <p role="alert">{error}</p>}
    <small>Pictures save immediately as the recipe photo.</small>
  </section>;
}
