/*
wav encoder + encoding engine
https://github.com/xiangyuecn/Recorder

mp3 and wav are of course the most recommended formats, and the code prioritizes these two formats.
Browser support:
https://developer.mozilla.org/en-US/docs/Web/HTML/Supported_media_formats

Encoding principle: prepending a 44-byte wav header to the pcm data produces a wav file; the pcm data is the raw buffers data from Recorder (resampled), LE (Little Endian) mode at 16 bits — essentially not encoded at all.
*/
(function(){
"use strict";

Recorder.prototype.enc_wav={
	stable:true
	,testmsg:"Supports 8-bit and 16-bit sample depth (set via bitRate); any sample rate value is allowed"
};
Recorder.prototype.wav=function(res,True,False){
		var This=this,set=This.set
			,size=res.length
			,sampleRate=set.sampleRate
			,bitRate=set.bitRate==8?8:16;
		
		//encode data https://github.com/mattdiamond/Recorderjs https://www.cnblogs.com/blqw/p/3782420.html https://www.cnblogs.com/xiaoqi/p/6993912.html
		var dataLength=size*(bitRate/8);
		var buffer=new ArrayBuffer(44+dataLength);
		var data=new DataView(buffer);
		
		var offset=0;
		var writeString=function(str){
			for (var i=0;i<str.length;i++,offset++) {
				data.setUint8(offset,str.charCodeAt(i));
			};
		};
		var write16=function(v){
			data.setUint16(offset,v,true);
			offset+=2;
		};
		var write32=function(v){
			data.setUint32(offset,v,true);
			offset+=4;
		};
		
		/* RIFF identifier */
		writeString('RIFF');
		/* RIFF chunk length */
		write32(36+dataLength);
		/* RIFF type */
		writeString('WAVE');
		/* format chunk identifier */
		writeString('fmt ');
		/* format chunk length */
		write32(16);
		/* sample format (raw) */
		write16(1);
		/* channel count */
		write16(1);
		/* sample rate */
		write32(sampleRate);
		/* byte rate (sample rate * block align) */
		write32(sampleRate*(bitRate/8));// *1 channel
		/* block align (channel count * bytes per sample) */
		write16(bitRate/8);// *1 channel
		/* bits per sample */
		write16(bitRate);
		/* data chunk identifier */
		writeString('data');
		/* data chunk length */
		write32(dataLength);
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
		
		
		True(new Blob([data.buffer],{type:"audio/wav"}));
	}
})();