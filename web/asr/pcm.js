/*
pcm encoder + encoding engine
https://github.com/xiangyuecn/Recorder

Encoding principle: the pcm data output by this encoder is actually the raw buffers data from Recorder (resampled), LE (Little Endian) mode at 16 bits, without any encoding applied.

The encoding code differs little from wav.js; prepending a 44-byte wav header to the pcm produces a wav file. So playing pcm is simple: just convert it to a wav file for playback — the conversion function Recorder.pcm2wav is provided.
*/
(function(){
"use strict";

Recorder.prototype.enc_pcm={
	stable:true
	,testmsg:"pcm is raw, uncontainerized audio data; pcm data files cannot be played directly. Supports 8-bit and 16-bit sample depth (set via bitRate); any sample rate value is allowed"
};
Recorder.prototype.pcm=function(res,True,False){
		var This=this,set=This.set
			,size=res.length
			,bitRate=set.bitRate==8?8:16;
		
		var buffer=new ArrayBuffer(size*(bitRate/8));
		var data=new DataView(buffer);
		var offset=0;
		
		// write sample data
		if(bitRate==8) {
			for(var i=0;i<size;i++,offset++) {
				//16-to-8-bit conversion, reportedly by Lei Xiaohua https://blog.csdn.net/sevennight1989/article/details/85376149 the details are a bit clearer than blqw's proportional algorithm, though both have noticeable noise
				var val=(res[i]>>8)+128;
				data.setInt8(offset,val,true);
			};
		}else{
			for (var i=0;i<size;i++,offset+=2){
				data.setInt16(offset,res[i],true);
			};
		};
		
		
		True(new Blob([data.buffer],{type:"audio/pcm"}));
	};





/**Transcode pcm directly into wav, which can be played directly; wav.js must also be included
data: {
		sampleRate:16000 sample rate of the pcm
		bitRate:16 bit depth of the pcm; allowed values: 8 or 16
		blob:blob object
	}
	If data is provided directly as a blob, the 16-bit 16kHz configuration is used by default; for testing only
True(wavBlob,duration)
False(msg)
**/
Recorder.pcm2wav=function(data,True,False){
	if(data.slice && data.type!=null){//Blob, for testing
		data={blob:data};
	};
	var sampleRate=data.sampleRate||16000,bitRate=data.bitRate||16;
	if(!data.sampleRate || !data.bitRate){
		console.warn("pcm2wav requires sampleRate and bitRate to be provided");
	};
	if(!Recorder.prototype.wav){
		False("pcm2wav requires the wav encoder (wav.js) to be loaded first");
		return;
	};
	
	var reader=new FileReader();
	reader.onloadend=function(){
		var pcm;
		if(bitRate==8){
			//convert 8-bit to 16-bit
			var u8arr=new Uint8Array(reader.result);
			pcm=new Int16Array(u8arr.length);
			for(var j=0;j<u8arr.length;j++){
				pcm[j]=(u8arr[j]-128)<<8;
			};
		}else{
			pcm=new Int16Array(reader.result);
		};
		
		Recorder({
			type:"wav"
			,sampleRate:sampleRate
			,bitRate:bitRate
		}).mock(pcm,sampleRate).stop(function(wavBlob,duration){
			True(wavBlob,duration);
		},False);
	};
	reader.readAsArrayBuffer(data.blob);
};



})();