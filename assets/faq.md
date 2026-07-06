1.  pytorch3d fails to install\
    Build from source

```bash
git clone https://github.com/facebookresearch/pytorch3d.git
python setup.py install
```

2.  WebSocket connection error\
    Modify python/site-packages/flask\_sockets.py

```python
Change self.url_map.add(Rule(rule, endpoint=f)) to
self.url_map.add(Rule(rule, endpoint=f, websocket=True))
```

3. protobuf version too high

```bash
pip uninstall protobuf
pip install protobuf==3.20.1
```

4. The digital human does not blink\
Add the following step when training the model

> Obtain AU45 for eyes blinking.\
> Run FeatureExtraction in OpenFace, rename and move the output CSV file to data/\<ID>/au.csv.

Copy au.csv into this project's data directory

5. Add a background image to the digital human

```bash
python app.py --bg_img bc.jpg
```

6. Dimension mismatch error when using your own trained model\
Use wav2vec to extract audio features when training the model

```bash
python main.py data/ --workspace workspace/ -O --iters 100000 --asr_model cpierse/wav2vec2-large-xlsr-53-esperanto
```

7. Wrong ffmpeg version for RTMP streaming
Community feedback suggests version 4.2.2 is needed. I am not sure exactly which versions do not work. The rule of thumb is to run ffmpeg and check that the printed info includes libx264; if it does not, it definitely will not work
```
--enable-libx264
```
8. Replacing with your own trained model
```python
.
├── data
│   ├── data_kf.json (corresponds to transforms_train.json in the training data)
│   ├── au.csv			
│   ├── pretrained
│   └── └── ngp_kf.pth (corresponds to the trained model ngp_ep00xx.pth)

```


Other references
https://github.com/lipku/metahuman-stream/issues/43#issuecomment-2008930101


