/*
Recording
https://github.com/xiangyuecn/Recorder
*/
(function(factory){
	factory(window);
	//umd returnExports.js
	if(typeof(define)=='function' && define.amd){
		define(function(){
			return Recorder;
		});
	};
	if(typeof(module)=='object' && module.exports){
		module.exports=Recorder;
	};
}(function(window){
"use strict";

var NOOP=function(){};

var Recorder=function(set){
	return new initFn(set);
};
Recorder.LM="2023-02-01 18:05";
var RecTxt="Recorder";
var getUserMediaTxt="getUserMedia";
var srcSampleRateTxt="srcSampleRate";
var sampleRateTxt="sampleRate";
var CatchTxt="catch";


//Whether global microphone recording is already open, everything is ready, and we are just waiting to receive audio data
Recorder.IsOpen=function(){
	var stream=Recorder.Stream;
	if(stream){
		var tracks=stream.getTracks&&stream.getTracks()||stream.audioTracks||[];
		var track=tracks[0];
		if(track){
			var state=track.readyState;
			return state=="live"||state==track.LIVE;
		};
	};
	return false;
};
/*AudioContext buffer size for H5 recording. Affects the onProcess callback rate during H5 recording; relative to AudioContext.sampleRate=48000, 4096 is close to 12 frames/s. Adjusting this parameter can produce smoother callback animations.
	Allowed values: 256, 512, 1024, 2048, 4096, 8192, or 16384
	Note: do not set it too low; starting at 2048, some browsers may not keep up with the callback rate, causing audio quality problems.
	Usually no adjustment is needed; after changing it, close any open recording first, then open again for it to take effect.
*/
Recorder.BufferSize=4096;
//Destroy all held global resources; call this method explicitly when Recorder is to be removed completely
Recorder.Destroy=function(){
	CLog(RecTxt+" Destroy");
	Disconnect();//disconnect any existing global Stream and resources
	
	for(var k in DestroyList){
		DestroyList[k]();
	};
};
var DestroyList={};
//Register a handler that needs to destroy global resources
Recorder.BindDestroy=function(key,call){
	DestroyList[key]=call;
};
//Check whether the browser supports recording; can be called at any time. Note: this only detects browser support; it does not check or trigger user authorization, and does not check support for recording in specific formats.
Recorder.Support=function(){
	var scope=navigator.mediaDevices||{};
	if(!scope[getUserMediaTxt]){
		scope=navigator;
		scope[getUserMediaTxt]||(scope[getUserMediaTxt]=scope.webkitGetUserMedia||scope.mozGetUserMedia||scope.msGetUserMedia);
	};
	if(!scope[getUserMediaTxt]){
		return false;
	};
	Recorder.Scope=scope;
	
	if(!Recorder.GetContext()){
		return false;
	};
	return true;
};
//Get the global AudioContext object; returns null if the browser does not support it
Recorder.GetContext=function(){
	var AC=window.AudioContext;
	if(!AC){
		AC=window.webkitAudioContext;
	};
	if(!AC){
		return null;
	};
	
	if(!Recorder.Ctx||Recorder.Ctx.state=="closed"){
		//Must not construct repeatedly; older versions throw: number of hardware contexts reached maximum (6)
		Recorder.Ctx=new AC();
		
		Recorder.BindDestroy("Ctx",function(){
			var ctx=Recorder.Ctx;
			if(ctx&&ctx.close){//close it if possible; otherwise keep it
				ctx.close();
				Recorder.Ctx=0;
			};
		});
	};
	return Recorder.Ctx;
};


/*Whether to use MediaRecorder.WebM.PCM for the audio capture connection (if the browser supports it); enabled by default. When disabled or unsupported, AudioWorklet or ScriptProcessor is used to connect. Audio data captured by MediaRecorder is better than other methods, with almost no frame loss, so audio quality is noticeably better; keeping this enabled is recommended*/
var ConnectEnableWebM="ConnectEnableWebM";
Recorder[ConnectEnableWebM]=true;

/*Whether to use the AudioWorklet feature for the audio capture connection (if the browser supports it); disabled by default. When disabled or unsupported, the deprecated ScriptProcessor is used to connect (if the method still exists). The current AudioWorklet implementation is less robust than ScriptProcessor on mobile. If ConnectEnableWebM is enabled and effective, this parameter has no effect*/
var ConnectEnableWorklet="ConnectEnableWorklet";
Recorder[ConnectEnableWorklet]=false;

/*Initialize the H5 audio capture connection. If a sourceStream is provided by the caller, only a simple one-time connection is performed. For ordinary microphone recording the Stream is global; on Safari it cannot be reconnected after disconnecting (resulting in silence), so global handling is used everywhere to avoid calling disconnect. Global handling also helps hide low-level details: start does not need to call the low-level API again, improving compatibility and reliability.*/
var Connect=function(streamStore,isUserMedia){
	var bufferSize=streamStore.BufferSize||Recorder.BufferSize;
	
	var ctx=Recorder.Ctx,stream=streamStore.Stream;
	var mediaConn=function(node){
		var media=stream._m=ctx.createMediaStreamSource(stream);
		var ctxDest=ctx.destination,cmsdTxt="createMediaStreamDestination";
		if(ctx[cmsdTxt]){
			ctxDest=ctx[cmsdTxt]();
		};
		media.connect(node);
		node.connect(ctxDest);
	}
	var isWebM,isWorklet,badInt,webMTips="";
	var calls=stream._call;
	
	//Handle the audio data returned by the browser
	var onReceive=function(float32Arr){
		for(var k0 in calls){//has item
			var size=float32Arr.length;
			
			var pcm=new Int16Array(size);
			var sum=0;
			for(var j=0;j<size;j++){//floatTo16BitPCM 
				var s=Math.max(-1,Math.min(1,float32Arr[j]));
				s=s<0?s*0x8000:s*0x7FFF;
				pcm[j]=s;
				sum+=Math.abs(s);
			};
			
			for(var k in calls){
				calls[k](pcm,sum);
			};
			
			return;
		};
	};
	
	var scriptProcessor="ScriptProcessor";//a bunch of string names, which helps js minification
	var audioWorklet="audioWorklet";
	var recAudioWorklet=RecTxt+" "+audioWorklet;
	var RecProc="RecProc";
	var MediaRecorderTxt="MediaRecorder";
	var MRWebMPCM=MediaRecorderTxt+".WebM.PCM";


//===================Connection method 3=========================
	//Ancient ScriptProcessor handling; currently compatible with all browsers. Although it is a deprecated method, it is more robust, and mobile performance is better than AudioWorklet
	var oldFn=ctx.createScriptProcessor||ctx.createJavaScriptNode;
	var oldIsBest=". Because "+audioWorklet+" internally fires 375 callbacks per second, performance issues on mobile may cause lost callbacks and shortened recordings; PCs are unaffected. Enabling "+audioWorklet+" is not recommended for now.";
	var oldScript=function(){
		isWorklet=stream.isWorklet=false;
		_Disconn_n(stream);
		CLog("Connect is using the legacy "+scriptProcessor+"; "+(Recorder[ConnectEnableWorklet]?"already set ":"you can set ")+RecTxt+"."+ConnectEnableWorklet+"=true to try enabling "+audioWorklet+webMTips+oldIsBest,3);
		
		var process=stream._p=oldFn.call(ctx,bufferSize,1,1);//mono, keeps data processing simple
		mediaConn(process);
		
		var _DsetTxt="_D220626",_Dset=Recorder[_DsetTxt];if(_Dset)CLog("Use "+RecTxt+"."+_DsetTxt,3);
		process.onaudioprocess=function(e){
			var arr=e.inputBuffer.getChannelData(0);
			if(_Dset){//temporary debugging parameter; will be removed in the future
				arr=new Float32Array(arr);//the block is shared and must be copied out
				setTimeout(function(){ onReceive(arr) });//exit the callback immediately, trying to reduce the impact on browser recording
			}else{
				onReceive(arr);
			};
		};
	};


//===================Connection method 2=========================
var connWorklet=function(){
	//Try enabling AudioWorklet processing
	isWebM=stream.isWebM=false;
	_Disconn_r(stream);
	
	isWorklet=stream.isWorklet=!oldFn || Recorder[ConnectEnableWorklet];
	var AwNode=window.AudioWorkletNode;
	if(!(isWorklet && ctx[audioWorklet] && AwNode)){
		oldScript();//disabled or unsupported; use the legacy one directly
		return;
	};
	var clazzUrl=function(){
		var xf=function(f){return f.toString().replace(/^function|DEL_/g,"").replace(/\$RA/g,recAudioWorklet)};
		var clazz='class '+RecProc+' extends AudioWorkletProcessor{';
			clazz+="constructor "+xf(function(option){
				DEL_super(option);
				var This=this,bufferSize=option.processorOptions.bufferSize;
				This.bufferSize=bufferSize;
				This.buffer=new Float32Array(bufferSize*2);//a bogus size may mess up the buffer; not our problem
				This.pos=0;
				This.port.onmessage=function(e){
					if(e.data.kill){
						This.kill=true;
						console.log("$RA kill call");
					}
				};
				console.log("$RA .ctor call", option);
			});
			
			//https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process each callback delivers 128 samples, 375 callbacks per second; this high frequency causes performance problems on mobile, resulting in missing callbacks and therefore lost data. PCs seem to have no performance problem
			clazz+="process "+xf(function(input,b,c){//callbacks only start after ctx is activated
				var This=this,bufferSize=This.bufferSize;
				var buffer=This.buffer,pos=This.pos;
				input=(input[0]||[])[0]||[];
				if(input.length){
					buffer.set(input,pos);
					pos+=input.length;
					
					var len=~~(pos/bufferSize)*bufferSize;
					if(len){
						this.port.postMessage({ val: buffer.slice(0,len) });
						
						var more=buffer.subarray(len,pos);
						buffer=new Float32Array(bufferSize*2);
						buffer.set(more);
						pos=more.length;
						This.buffer=buffer;
					}
					This.pos=pos;
				}
				return !This.kill;
			});
		clazz+='}'
			+'try{'
				+'registerProcessor("'+RecProc+'", '+RecProc+')'
			+'}catch(e){'
				+'console.error("'+recAudioWorklet+' registration failed",e)'
			+'}';
		//With URL.createObjectURL some browsers report "Not allowed to load local resource" locally, so use a data url directly
		return "data:text/javascript;base64,"+btoa(unescape(encodeURIComponent(clazz)));
	};
	
	var awNext=function(){//may continue; disconnect has not been called
		return isWorklet && stream._na;
	};
	var nodeAlive=stream._na=function(){
		//called on start; if no data has been received, conclude that AudioWorklet has a problem and fall back to the legacy one
		if(badInt!==""){//no data has been called back yet
			clearTimeout(badInt);
			badInt=setTimeout(function(){
				badInt=0;
				if(awNext()){
					CLog(audioWorklet+" returned no audio; reverting to "+scriptProcessor,3);
					oldFn&&oldScript();//in the future the legacy one may not exist; this could be a false positive
				};
			},500);
		};
	};
	var createNode=function(){
		if(!awNext())return;
		var node=stream._n=new AwNode(ctx, RecProc, {
			processorOptions:{bufferSize:bufferSize}
		});
		mediaConn(node);
		node.port.onmessage=function(e){
			if(badInt){
				clearTimeout(badInt);badInt="";
			};
			if(awNext()){
				onReceive(e.data.val);
			}else if(!isWorklet){
				CLog(audioWorklet+" redundant callback",3);
			};
		};
		CLog("Connect is using "+audioWorklet+"; set "+RecTxt+"."+ConnectEnableWorklet+"=false to revert to the legacy "+scriptProcessor+webMTips+oldIsBest,3);
	};
	
	//If the resume during start and the node construction below run at the same time, some browsers will crash; testable via ztest_chrome_bug_AudioWorkletNode.html in the source assets. So wrap all code inside resume (regardless of catch) to avoid this problem
	ctx.resume()[calls&&"finally"](function(){//comment out this line to watch the browser crash with STATUS_ACCESS_VIOLATION
		if(!awNext())return;
		if(ctx[RecProc]){
			createNode();
			return;
		};
		var url=clazzUrl();
		ctx[audioWorklet].addModule(url).then(function(e){
			if(!awNext())return;
			ctx[RecProc]=1;
			createNode();
			if(badInt){//restart the timer
				nodeAlive();
			};
		})[CatchTxt](function(e){ //fix keyword, ensures catch stays in string form during minification
			CLog(audioWorklet+".addModule failed",1,e);
			awNext()&&oldScript();
		});
	});
};


//===================Connection method 1=========================
var connWebM=function(){
	//Try enabling MediaRecorder webm+pcm recording
	var MR=window[MediaRecorderTxt];
	var onData="ondataavailable";
	var webmType="audio/webm; codecs=pcm";
	isWebM=stream.isWebM=Recorder[ConnectEnableWebM];
	
	var supportMR=MR && (onData in MR.prototype) && MR.isTypeSupported(webmType);
	webMTips=supportMR?"":" (this browser does not support "+MRWebMPCM+")";
	if(!isUserMedia || !isWebM || !supportMR){
		connWorklet(); //non-microphone recording (MediaRecorder sample rate is uncontrollable), or disabled, or MediaRecorder unsupported, or webm+pcm unsupported
		return;
	}
	
	var mrNext=function(){//may continue; disconnect has not been called
		return isWebM && stream._ra;
	};
	var mrAlive=stream._ra=function(){
		//called on start; if no data has been received, conclude that MediaRecorder has a problem and downgrade
		if(badInt!==""){//no data has been called back yet
			clearTimeout(badInt);
			badInt=setTimeout(function(){
				//badInt=0; left for nodeAlive to keep checking
				if(mrNext()){
					CLog(MediaRecorderTxt+" returned no audio; downgrading to "+audioWorklet,3);
					connWorklet();
				};
			},500);
		};
	};
	
	var mrSet=Object.assign({mimeType:webmType}, Recorder.ConnectWebMOptions);
	var mr=stream._r=new MR(stream, mrSet);
	var webmData=stream._rd={sampleRate:ctx[sampleRateTxt]};
	mr[onData]=function(e){
		//extract the pcm data from the webm; if extraction fails, wait for the badInt timeout to downgrade
		var reader=new FileReader();
		reader.onloadend=function(){
			if(mrNext()){
				var f32arr=WebM_Extract(new Uint8Array(reader.result),webmData);
				if(!f32arr)return;
				if(f32arr==-1){//cannot extract; downgrade immediately
					connWorklet();
					return;
				};
				
				if(badInt){
					clearTimeout(badInt);badInt="";
				};
				onReceive(f32arr);
			}else if(!isWebM){
				CLog(MediaRecorderTxt+" redundant callback",3);
			};
		};
		reader.readAsArrayBuffer(e.data);
	};
	mr.start(~~(bufferSize/48));//callback interval based on 48k
	CLog("Connect is using "+MRWebMPCM+"; set "+RecTxt+"."+ConnectEnableWebM+"=false to revert to "+audioWorklet+" or the legacy "+scriptProcessor);
};

	connWebM();
};
var ConnAlive=function(stream){
	if(stream._na) stream._na(); //check whether the AudioWorklet connection is working; if not, roll back to the legacy ScriptProcessor
	if(stream._ra) stream._ra(); //check whether the MediaRecorder connection is working; if not, downgrade
};
var _Disconn_n=function(stream){
	stream._na=null;
	if(stream._n){
		stream._n.port.postMessage({kill:true});
		stream._n.disconnect();
		stream._n=null;
	};
};
var _Disconn_r=function(stream){
	stream._ra=null;
	if(stream._r){
		stream._r.stop();
		stream._r=null;
	};
};
var Disconnect=function(streamStore){
	streamStore=streamStore||Recorder;
	var isGlobal=streamStore==Recorder;
	
	var stream=streamStore.Stream;
	if(stream){
		if(stream._m){
			stream._m.disconnect();
			stream._m=null;
		};
		if(stream._p){
			stream._p.disconnect();
			stream._p.onaudioprocess=stream._p=null;
		};
		_Disconn_n(stream);
		_Disconn_r(stream);
		
		if(isGlobal){//when global, the stream (microphone) must be shut down; directly provided streams are left alone
			var tracks=stream.getTracks&&stream.getTracks()||stream.audioTracks||[];
			for(var i=0;i<tracks.length;i++){
				var track=tracks[i];
				track.stop&&track.stop();
			};
			stream.stop&&stream.stop();
		};
	};
	streamStore.Stream=0;
};

/*Convert the sample rate of pcm data
pcmDatas: [[Int16,...]] list of pcm chunks
pcmSampleRate:48000 sample rate of the pcm data
newSampleRate:16000 target sample rate; when newSampleRate>=pcmSampleRate no processing is done, when smaller the data is resampled
prevChunkInfo:{} optional, the return value of the previous call, used for continuous conversion; this call will start processing from where the last one ended. Alternatively, define your own ChunkInfo to start converting from a given position in pcmDatas
option:{ optional, configuration
		frameSize:123456 frame size, the number of PCM Int16 samples per frame; the converted pcm length is an integer multiple of frameSize, used for continuous conversion. Currently only useful for the mp3 format, where frameSize is 1152 so that the encoded mp3 duration exactly matches the pcm duration; otherwise padding added when the last mp3 frame is not full would lengthen the mp3.
		frameType:"" frame type, usually rec.set.type; when provided, frameSize is unnecessary and the best value is assigned automatically. Currently only mp3=1152 (samples per frame in MPEG1 Layer3) is supported; other types=1.
			The two parameters above are for continuous conversion; use at most one. When neither is provided, no special frame handling is done; when provided, prevChunkInfo must also be provided to have any effect. When processing the final chunk of data, omit the frame size so the last bits of residual data are output.
	}

Returns ChunkInfo:{
	//may be preset to convert from a given position to the end
	index:0 index in pcmDatas processed so far
	offset:0.0 next position of the offset within the pcm corresponding to the processed index

	//return values only
	frameNext:null||[Int16,...] partial data of the next frame; may only exist when frameSize is set
	sampleRate:16000 sample rate of the result, <=newSampleRate
	data:[Int16,...] converted PCM result; for continuous conversion, when pcmDatas contains no new data, data's length may be 0
}
*/
Recorder.SampleData=function(pcmDatas,pcmSampleRate,newSampleRate,prevChunkInfo,option){
	prevChunkInfo||(prevChunkInfo={});
	var index=prevChunkInfo.index||0;
	var offset=prevChunkInfo.offset||0;
	
	var frameNext=prevChunkInfo.frameNext||[];
	option||(option={});
	var frameSize=option.frameSize||1;
	if(option.frameType){
		frameSize=option.frameType=="mp3"?1152:1;
	};
	
	var nLen=pcmDatas.length;
	if(index>nLen+1){
		CLog("SampleData seems to have been given a chunk that was not reset "+index+">"+nLen,3);
	};
	var size=0;
	for(var i=index;i<nLen;i++){
		size+=pcmDatas[i].length;
	};
	size=Math.max(0,size-Math.floor(offset));
	
	//sampling https://www.cnblogs.com/blqw/p/3782420.html
	var step=pcmSampleRate/newSampleRate;
	if(step>1){//new sample rate is lower than the recording rate: downsample
		size=Math.floor(size/step);
	}else{//new sample rate is higher than the recording rate: no processing, skipping interpolation
		step=1;
		newSampleRate=pcmSampleRate;
	};
	
	size+=frameNext.length;
	var res=new Int16Array(size);
	var idx=0;
	//prepend the leftover data from last time that did not fill a frame
	for(var i=0;i<frameNext.length;i++){
		res[idx]=frameNext[i];
		idx++;
	};
	//process the data
	for (;index<nLen;index++) {
		var o=pcmDatas[index];
		var i=offset,il=o.length;
		while(i<il){
			//res[idx]=o[Math.round(i)]; simple direct decimation

			//https://www.cnblogs.com/xiaoqi/p/6993912.html
			//current point = current point + increment toward the next point; audio quality is a bit better than simple direct decimation
			var before = Math.floor(i);
			var after = Math.ceil(i);
			var atPoint = i - before;
			
			var beforeVal=o[before];
			var afterVal=after<il ? o[after]
				: (//the next point is out of bounds; look in the next array
					(pcmDatas[index+1]||[beforeVal])[0]||0
				);
			res[idx]=beforeVal+(afterVal-beforeVal)*atPoint;
			
			idx++;
			i+=step;//decimation
		};
		offset=i-il;
	};
	//frame handling
	frameNext=null;
	var frameNextSize=res.length%frameSize;
	if(frameNextSize>0){
		var u8Pos=(res.length-frameNextSize)*2;
		frameNext=new Int16Array(res.buffer.slice(u8Pos));
		res=new Int16Array(res.buffer.slice(0,u8Pos));
	};
	
	return {
		index:index
		,offset:offset
		
		,frameNext:frameNext
		,sampleRate:newSampleRate
		,data:res
	};
};


/*A method for computing the volume as a percentage
pcmAbsSum: sum of the absolute values of all pcm Int16 samples
pcmLength: pcm length
Return value: 0-100, mainly used as a percentage
Note: this is not decibels, hence "volume" is not used as the name*/
Recorder.PowerLevel=function(pcmAbsSum,pcmLength){
	/*Compute volume https://blog.csdn.net/jody1989/article/details/73480259
	Higher-sensitivity algorithm:
		cap the maximum sensed value at 10000
			linear curve: unfriendly at low volume
				power/10000*100
			logarithmic curve: friendly at low volume, but a minimum sensed value must be set
				(1+Math.log10(power/10000))*100
	*/
	var power=(pcmAbsSum/pcmLength) || 0;//NaN
	var level;
	if(power<1251){//1250 yields 10%; smaller volumes use linear values
		level=Math.round(power/1250*10);
	}else{
		level=Math.round(Math.min(100,Math.max(0,(1+Math.log(power/10000)/Math.log(10))*100)));
	};
	return level;
};

/*Compute volume in dBFS (decibels relative to full scale)
maxSample: the largest absolute value among the 16-bit pcm samples (for peak volume), or the average of the absolute values of all pcm samples
Return value: -100~0 (maximum 0dB, minimum -100 substituting for -infinity)
*/
Recorder.PowerDBFS=function(maxSample){
	var val=Math.max(0.1, maxSample||0),Pref=0x7FFF;
	val=Math.min(val,Pref);
	//https://www.logiclocmusic.com/can-you-tell-the-decibel/
	//https://blog.csdn.net/qq_17256689/article/details/120442510
	val=20*Math.log(val/Pref)/Math.log(10);
	return Math.max(-100,Math.round(val));
};




//Timestamped log output; can be set to an empty function to suppress logging
//CLog(msg,errOrLogMsg, logMsg...) when err is a number it indicates the log type 1:error 2:log (default) 3:warn, otherwise it is treated as content to output; the first parameter cannot be an object because the time is concatenated, and any number of output parameters may follow
Recorder.CLog=function(msg,err){
	var now=new Date();
	var t=("0"+now.getMinutes()).substr(-2)
		+":"+("0"+now.getSeconds()).substr(-2)
		+"."+("00"+now.getMilliseconds()).substr(-3);
	var recID=this&&this.envIn&&this.envCheck&&this.id;
	var arr=["["+t+" "+RecTxt+(recID?":"+recID:"")+"]"+msg];
	var a=arguments,console=window.console||{};
	var i=2,fn=console.log;
	if(typeof(err)=="number"){
		fn=err==1?console.error:err==3?console.warn:fn;
	}else{
		i=1;
	};
	for(;i<a.length;i++){
		arr.push(a[i]);
	};
	if(IsLoser){//ancient browsers: only guarantee basic execution without code errors
		fn&&fn("[IsLoser]"+arr[0],arr.length>1?arr:"");
	}else{
		fn.apply(console,arr);
	};
};
var CLog=function(){ Recorder.CLog.apply(this,arguments); };
var IsLoser=true;try{IsLoser=!console.log.apply;}catch(e){};




var ID=0;
function initFn(set){
	this.id=++ID;
	
	//if traffic statistics are enabled, an image request will be sent here
	Traffic();
	
	
	var o={
		type:"mp3" //output type: mp3, wav; wav output files are huge and not recommended, but mp3 encoding support makes the js file very large; if mp3 support is not needed the js file can be greatly reduced
		,bitRate:16 //bit rate; wav: 16 or 8 bit, MP3: 8kbps 1k/s, 8kbps 2k/s makes very small recording files

		,sampleRate:16000 //sample rate; wav format size=sampleRate*duration; for mp3 this affects low bit rates, with almost no effect at high bit rates.
					//wav: any value; mp3 allowed values: 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000
					//sample rate reference: https://www.cnblogs.com/devin87/p/mp3-recorder.html

		,onProcess:NOOP //fn(buffers,powerLevel,bufferDuration,bufferSampleRate,newBufferIdx,asyncEnd) buffers=[[Int16,...],...]: buffered PCM data, all pcm chunks from the start of recording until now; powerLevel: volume level of the current buffer, 0-100; bufferDuration: buffered duration; bufferSampleRate: sample rate used by the buffer (when type supports encode-while-recording (Worker), this equals the configured sample rate, otherwise it may differ); newBufferIdx: starting index of the buffers added in this callback; asyncEnd:fn() if onProcess is asynchronous (returns true), this callback must be invoked when processing completes; ignore this parameter if not asynchronous. The invocation must be truly asynchronous (wrap with setTimeout if it cannot be). onProcess return value: returning true enables async mode, which is necessary for heavy computation; asyncEnd must be called when async processing completes (wrap with setTimeout if it cannot be truly async). After onProcess runs, the newly added buffers are all replaced with empty arrays, so at the start of this callback you should immediately save the buffers from newBufferIdx to the end of this callback into another array, and write them back to the corresponding positions in buffers after processing completes.
		
		//*******Advanced settings******
		//,sourceStream:MediaStream Object
				//optionally provide a media stream directly, recording and processing audio data from this stream in real time (the current Recorder instance has exclusive use of it); when not provided, ordinary microphone recording is used, with the audio stream provided by getUserMedia (all Recorder instances share the same stream)
				//for example: the stream returned by the captureStream method of audio/video tag dom nodes (experimental feature, browser support varies); a remote stream in WebRTC; a stream you created yourself, etc.
				//note: the stream must contain at least one Audio Track; for example, an audio tag only has an audio track after it is ready to start playing, otherwise open will fail

		//,audioTrackSet:{ deviceId:"",groupId:"", autoGainControl:true, echoCancellation:true, noiseSuppression:true }
				//audio configuration parameters for the getUserMedia method during ordinary microphone recording, e.g. specifying a device id, echo cancellation, noise suppression switches; note: any configuration value provided is not guaranteed to take effect
				//since the microphone is shared globally, after changing the configuration you must close the previous one and open again
				//more reference: https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints

		//,disableEnvInFix:false internal parameter, disables compensation for lost audio input when the device lags
		
		//,takeoffEncodeChunk:NOOP //fn(chunkBytes) chunkBytes=[Uint8,...]: takes over the encoder output in a real-time encoding environment; this method is called in real time whenever the encoder produces a valid chunk of binary audio data. The parameter is a binary Uint8Array, i.e. the encoded audio data fragment; concatenating all chunkBytes together yields the complete audio. The idea for this implementation was originally proposed by a QQ user
				//when this callback is provided, it takes over the encoder's data output, and the encoder internally stops storing the generated audio data. Environment requirements are strict: if the current environment does not support real-time encoding, the fail logic runs directly at open
				//therefore, after providing this callback, calling stop cannot yield valid audio data because the encoder holds no audio data, so the blob returned by stop will be a blob with a byte length of 0
				//currently only the mp3 format implements real-time encoding; in environments that support real-time processing, encoded mp3 fragments are called back through this method in real time, and concatenating all chunkBytes yields the complete mp3. The result of such concatenation has better audio quality than what the mock method generates in real time, because it naturally avoids leading and trailing silence
				//currently formats other than mp3 must not provide this callback; if provided, the fail logic runs directly at open
	};
	
	for(var k in set){
		o[k]=set[k];
	};
	this.set=o;
	
	this._S=9;//stop sync lock; stop can prevent a start that has not yet run during open
	this.Sync={O:9,C:9};//same as Recorder.Sync, except this one is non-global, used only to simplify code logic and has no real effect
};
//Sync lock, controls contention for the Stream; used to interrupt an asynchronous open during close; if an object's open has changed, close must be blocked and control of the Stream handed to the new object
Recorder.Sync={/*open*/O:9,/*close*/C:9};

Recorder.prototype=initFn.prototype={
	CLog:CLog
	
	//Which object stores the stream-related data; if sourceStream is provided, the data is stored directly in the current object, otherwise it is stored globally
	,_streamStore:function(){
		if(this.set.sourceStream){
			return this;
		}else{
			return Recorder;
		}
	}
	
	//Open the recording resource True(),False(msg,isUserNotAllow); close must be called afterwards. Note: this method is asynchronous; typically open when needed and close immediately after use; can be called repeatedly, and can be used to test whether recording is possible
	,open:function(True,False){
		var This=this,streamStore=This._streamStore();
		True=True||NOOP;
		var failCall=function(errMsg,isUserNotAllow){
			isUserNotAllow=!!isUserNotAllow;
			This.CLog("Recording open failed: "+errMsg+",isUserNotAllow:"+isUserNotAllow,1);
			False&&False(errMsg,isUserNotAllow);
		};
		
		var ok=function(){
			This.CLog("open ok id:"+This.id);
			True();
			
			This._SO=0;//lift stop's block on the start call within open
		};
		
		
		//sync lock
		var Lock=streamStore.Sync;
		var lockOpen=++Lock.O,lockClose=Lock.C;
		This._O=This._O_=lockOpen;//remember the current open; if it changes, close must be blocked. This assumes the new object has replaced the current one, which is no longer in use
		This._SO=This._S;//remember stop during open; after any stop call midway, the start within open must not proceed
		var lockFail=function(){
			//multiple opens are allowed, but no close is allowed, unless close was already called on this instance
			if(lockClose!=Lock.C || !This._O){
				var err="open was canceled";
				if(lockOpen==Lock.O){
					//no new open; close has been called to cancel, so the previous close should explicitly take effect here
					This.close();
				}else{
					err="open was interrupted";
				};
				failCall(err);
				return true;
			};
		};
		
		//environment configuration check
		var checkMsg=This.envCheck({envName:"H5",canProcess:true});
		if(checkMsg){
			failCall("Cannot record: "+checkMsg);
			return;
		};
		
		
		//***********An audio stream was provided directly************
		if(This.set.sourceStream){
			if(!Recorder.GetContext()){
				failCall("This browser does not support capturing recordings from a stream");
				return;
			};
			
			Disconnect(streamStore);//may already have been opened; try disconnecting first
			This.Stream=This.set.sourceStream;
			This.Stream._call={};
			
			try{
				Connect(streamStore);
			}catch(e){
				failCall("Failed to open recording from the stream: "+e.message);
				return;
			}
			ok();
			return;
		};
		
		
		//***********Open the microphone to obtain the global audio stream************
		var codeFail=function(code,msg){
			try{//check the cross-origin case first
				window.top.a;
			}catch(e){
				failCall('No permission to record (cross-origin; try adding a microphone access policy to the iframe, e.g. allow="camera;microphone")');
				return;
			};
			
			if(/Permission|Allow/i.test(code)){
				failCall("The user denied recording permission",true);
			}else if(window.isSecureContext===false){
				failCall("The browser blocks recording on insecure pages; enabling https can fix this");
			}else if(/Found/i.test(code)){//the missing device may be caused by an insecure environment
				failCall(msg+", no microphone available");
			}else{
				failCall(msg);
			};
		};
		
		
		//if already open and valid, do not open again
		if(Recorder.IsOpen()){
			ok();
			return;
		};
		if(!Recorder.Support()){
			codeFail("","This browser does not support recording");
			return;
		};

		//request permission; if never authorized, browsers typically show a permission prompt
		var f1=function(stream){
			//https://github.com/xiangyuecn/Recorder/issues/14 the obtained track.readyState!="live"; it may be fine right when the callback fires but get closed shortly after, cause unknown. Delay a bit to ensure true asynchronicity. No impact on normal browsers
			setTimeout(function(){
				stream._call={};
				var oldStream=Recorder.Stream;
				if(oldStream){
					Disconnect(); //directly disconnect the existing one; an unfinished old Connect will terminate automatically
					stream._call=oldStream._call;
				};
				Recorder.Stream=stream;
				if(lockFail())return;
				
				if(Recorder.IsOpen()){
					if(oldStream)This.CLog("Detected multiple simultaneous open calls",1);

					Connect(streamStore,1);
					ok();
				}else{
					failCall("Recording is not working: no audio stream");
				};
			},100);
		};
		var f2=function(e){
			var code=e.name||e.message||e.code+":"+e;
			This.CLog("Error requesting recording permission",1,e);

			codeFail(code,"Cannot record: "+code);
		};
		
		var trackSet={
			noiseSuppression:false //noise suppression disabled by default for raw recording, to avoid odd behavior on mobile (including quieter system playback)
			,echoCancellation:false //echo cancellation
		};
		var trackSet2=This.set.audioTrackSet;
		for(var k in trackSet2)trackSet[k]=trackSet2[k];
		trackSet.sampleRate=Recorder.Ctx.sampleRate;//the sample rate must be specified, otherwise MediaRecorder on phones uses a 16k sample rate
		
		try{
			var pro=Recorder.Scope[getUserMediaTxt]({audio:trackSet},f1,f2);
		}catch(e){//if trackSet cannot be set, never mind
			This.CLog(getUserMediaTxt,3,e);
			pro=Recorder.Scope[getUserMediaTxt]({audio:true},f1,f2);
		};
		if(pro&&pro.then){
			pro.then(f1)[CatchTxt](f2); //fix keyword, ensures catch stays in string form during minification
		};
	}
	//Close and release the recording resources
	,close:function(call){
		call=call||NOOP;
		
		var This=this,streamStore=This._streamStore();
		This._stop();
		
		var Lock=streamStore.Sync;
		This._O=0;
		if(This._O_!=Lock.O){
			//control of the sole Stream resource has been handed to a new object; must not close here. In browsers that prompt for permission every time this may leak: if the new object is denied permission it may never call close; this case is ignored
			This.CLog("close ignored (because multiple recs were opened at the same time, only the last one will truly close)",3);
			call();
			return;
		};
		Lock.C++;//take control
		
		Disconnect(streamStore);
		
		This.CLog("close");
		call();
	}
	
	
	
	
	
	/*Mock a piece of recording data; stop can be called afterwards for encoding. Provide pcm data [1,2,3...] and the pcm sample rate*/
	,mock:function(pcmData,pcmSampleRate){
		var This=this;
		This._stop();//clean up existing resources
		
		This.isMock=1;
		This.mockEnvInfo=null;
		This.buffers=[pcmData];
		This.recSize=pcmData.length;
		This[srcSampleRateTxt]=pcmSampleRate;
		return This;
	}
	,envCheck:function(envInfo){//availability check under the platform environment; may be called at any time. Returns errMsg: "" if OK, otherwise the failure reason
		//envInfo={envName:"H5",canProcess:true}
		var errMsg,This=this,set=This.set;
		
		//Detect the CPU's numeric byte order; TypedArray byte order is a mystery. Simply reject the rare big-endian mode, since no such CPU could be found for testing
		var tag="CPU_BE";
		if(!errMsg && !Recorder[tag] && window.Int8Array && !new Int8Array(new Int32Array([1]).buffer)[0]){
			Traffic(tag); //if traffic statistics are enabled, an image request will be sent here
			errMsg=tag+" architecture is not supported";
		};
		
		//Encoder check: whether the configuration is usable in this environment
		if(!errMsg){
			var type=set.type;
			if(This[type+"_envCheck"]){//the encoder implements an environment check
				errMsg=This[type+"_envCheck"](envInfo,set);
			}else{//no check implemented: manually verify whether the configuration is valid
				if(set.takeoffEncodeChunk){
					errMsg="Type "+type+(This[type]?"":" (encoder not loaded)")+" does not support setting takeoffEncodeChunk";
				};
			};
		};
		
		return errMsg||"";
	}
	,envStart:function(mockEnvInfo,sampleRate){//platform-environment-specific start call
		var This=this,set=This.set;
		This.isMock=mockEnvInfo?1:0;//non-H5 environments must enable mock and provide the environment info required by envCheck
		This.mockEnvInfo=mockEnvInfo;
		This.buffers=[];//data buffer
		This.recSize=0;//data size

		This.envInLast=0;//time when envIn received the last recorded content
		This.envInFirst=0;//recording time of the first recorded content received by envIn
		This.envInFix=0;//total compensated time
		This.envInFixTs=[];//compensation counting list

		//engineCtx needs the final sample rate determined in advance
		var setSr=set[sampleRateTxt];
		if(setSr>sampleRate){
			set[sampleRateTxt]=sampleRate;
		}else{ setSr=0 }
		This[srcSampleRateTxt]=sampleRate;
		This.CLog(srcSampleRateTxt+": "+sampleRate+" set."+sampleRateTxt+": "+set[sampleRateTxt]+(setSr?" ignoring "+setSr:""), setSr?3:0);

		This.engineCtx=0;
		//this type supports encode-while-recording (Worker)
		if(This[set.type+"_start"]){
			var engineCtx=This.engineCtx=This[set.type+"_start"](set);
			if(engineCtx){
				engineCtx.pcmDatas=[];
				engineCtx.pcmSize=0;
			};
		};
	}
	,envResume:function(){//platform-environment-independent resume of recording
		//restart counting
		this.envInFixTs=[];
	}
	,envIn:function(pcm,sum){//platform-environment-independent pcm[Int16] input
		var This=this,set=This.set,engineCtx=This.engineCtx;
		var bufferSampleRate=This[srcSampleRateTxt];
		var size=pcm.length;
		var powerLevel=Recorder.PowerLevel(sum,size);
		
		var buffers=This.buffers;
		var bufferFirstIdx=buffers.length;//earlier buffers have already been processed by onProcess and must not be modified again
		buffers.push(pcm);
		
		//will be overwritten when engineCtx exists, so keep a copy here
		var buffersThis=buffers;
		var bufferFirstIdxThis=bufferFirstIdx;
		
		//Lag-loss compensation: when the device lags badly, H5 receives too little data, causing playback speed changes and a duration shorter than actual. This ensures it does not get shorter, but cannot repair the audio quality degradation caused by lost audio data. The current algorithm uses input timing to detect whether the next frame needs a compensation frame; detection only starts after (6 inputs || more than 1 second), and compensation is performed if more than 1/3 is lost within the sliding window
		var now=Date.now();
		var pcmTime=Math.round(size/bufferSampleRate*1000);
		This.envInLast=now;
		if(This.buffers.length==1){//note the recording time of the first recorded data
			This.envInFirst=now-pcmTime;
		};
		var envInFixTs=This.envInFixTs;
		envInFixTs.splice(0,0,{t:now,d:pcmTime});
		//keep a 3-second counting sliding window; additionally, pauses longer than 3 seconds are not compensated
		var tsInStart=now,tsPcm=0;
		for(var i=0;i<envInFixTs.length;i++){
			var o=envInFixTs[i];
			if(now-o.t>3000){
				envInFixTs.length=i;
				break;
			};
			tsInStart=o.t;
			tsPcm+=o.d;
		};
		//enough data has been collected; start detecting whether compensation is needed
		var tsInPrev=envInFixTs[1];
		var tsIn=now-tsInStart;
		var lost=tsIn-tsPcm;
		if( lost>tsIn/3 && (tsInPrev&&tsIn>1000 || envInFixTs.length>=6) ){
			//too much lost; start performing compensation
			var addTime=now-tsInPrev.t-pcmTime;//this many ms lost since the last input
			if(addTime>pcmTime/5){//more than 1/5 of this frame lost
				var fixOpen=!set.disableEnvInFix;
				This.CLog("["+now+"]"+(fixOpen?"":"not ")+"compensating "+addTime+"ms",3);
				This.envInFix+=addTime;

				//compensate with silence
				if(fixOpen){
					var addPcm=new Int16Array(addTime*bufferSampleRate/1000);
					size+=addPcm.length;
					buffers.push(addPcm);
				};
			};
		};
		
		
		var sizeOld=This.recSize,addSize=size;
		var bufferSize=sizeOld+addSize;
		This.recSize=bufferSize;//this value needs to be corrected after onProcess, since new data may have been modified
		
		
		//this type supports encode-while-recording (Worker); enable real-time transcoding
		if(engineCtx){
			//convert to the sample rate in set
			var chunkInfo=Recorder.SampleData(buffers,bufferSampleRate,set[sampleRateTxt],engineCtx.chunkInfo);
			engineCtx.chunkInfo=chunkInfo;
			
			sizeOld=engineCtx.pcmSize;
			addSize=chunkInfo.data.length;
			bufferSize=sizeOld+addSize;
			engineCtx.pcmSize=bufferSize;//this value needs to be corrected after onProcess, since new data may have been modified
			
			buffers=engineCtx.pcmDatas;
			bufferFirstIdx=buffers.length;
			buffers.push(chunkInfo.data);
			bufferSampleRate=chunkInfo[sampleRateTxt];
		};
		
		var duration=Math.round(bufferSize/bufferSampleRate*1000);
		var bufferNextIdx=buffers.length;
		var bufferNextIdxThis=buffersThis.length;
		
		//allow asynchronous processing of buffer data
		var asyncEnd=function(){
			//recompute size; the async path has already subtracted the added amount, the sync path must remove this addition and then recompute
			var num=asyncBegin?0:-addSize;
			var hasClear=buffers[0]==null;
			for(var i=bufferFirstIdx;i<bufferNextIdx;i++){
				var buffer=buffers[i];
				if(buffer==null){//memory has been proactively released, e.g. during long real-time recording transfers
					hasClear=1;
				}else{
					num+=buffer.length;

					//push to the background for encode-while-recording
					if(engineCtx&&buffer.length){
						This[set.type+"_encode"](engineCtx,buffer);
					};
				};
			};
			
			//synchronously clean up This.buffers; regardless of how many buffers were cleared, buffersThis is unused so clear it entirely
			if(hasClear && engineCtx){
				var i=bufferFirstIdxThis;
				if(buffersThis[0]){
					i=0;
				};
				for(;i<bufferNextIdxThis;i++){
					buffersThis[i]=null;
				};
			};
			
			//tally the modified size; if a clear happened asynchronously, add it back as-is; the sync path needs no action
			if(hasClear){
				num=asyncBegin?addSize:0;

				buffers[0]=null;//completely cleared
			};
			if(engineCtx){
				engineCtx.pcmSize+=num;
			}else{
				This.recSize+=num;
			};
		};
		//real-time callback to process data; modifying or replacing the data added since the last callback is allowed, but modifying already-processed data is not, nor is adding/removing elements of the first-dimension array; the second-dimension arrays may be modified arbitrarily, including replacement with empty arrays
		var asyncBegin=0,procTxt="rec.set.onProcess";
		try{
			asyncBegin=set.onProcess(buffers,powerLevel,duration,bufferSampleRate,bufferFirstIdx,asyncEnd);
		}catch(e){
			//do not use CLog to display this error, so identical content is not printed repeatedly in the console
			console.error(procTxt+" errors in the callback are not allowed; ensure it never throws",e);
		};
		
		var slowT=Date.now()-now;
		if(slowT>10 && This.envInFirst-now>1000){ //start onProcess performance monitoring after 1 second
			This.CLog(procTxt+" low performance, took "+slowT+"ms",3);
		};
		
		if(asyncBegin===true){
			//async mode enabled; onProcess has taken over the new buffers data, so clear it immediately to avoid unprocessed data
			var hasClear=0;
			for(var i=bufferFirstIdx;i<bufferNextIdx;i++){
				if(buffers[i]==null){//memory has been proactively released, e.g. during long real-time recording transfers, yet async mode is being enabled; this situation is invalid
					hasClear=1;
				}else{
					buffers[i]=new Int16Array(0);
				};
			};
			
			if(hasClear){
				This.CLog("buffers must not be cleared before entering async mode",3);
			}else{
				//restore size; after async finishes, tally only the modified size; if a clear happens, add it back as-is
				if(engineCtx){
					engineCtx.pcmSize-=addSize;
				}else{
					This.recSize-=addSize;
				};
			};
		}else{
			asyncEnd();
		};
	}
	
	
	
	
	//Start recording; open must be called first. As long as open succeeded, calling this method is safe; internal errors caused by forcing a call without open produce no message, and the error will naturally surface at stop
	,start:function(){
		var This=this,ctx=Recorder.Ctx;
		
		var isOpen=1;
		if(This.set.sourceStream){//a stream was provided directly; only check whether open was called
			if(!This.Stream){
				isOpen=0;
			}
		}else if(!Recorder.IsOpen()){//check whether the global microphone is open and working
			isOpen=0;
		};
		if(!isOpen){
			This.CLog("not opened",1);
			return;
		};
		This.CLog("Start recording");

		This._stop();
		This.state=3;//0 not recording, 1 recording, 2 paused, 3 waiting for ctx activation
		This.envStart(null, ctx[sampleRateTxt]);
		
		//check whether stop was already called during open
		if(This._SO&&This._SO+1!=This._S){//_stop was called once above
			//stop was called before open completed; abort start in this case. This situation should also be avoided as much as possible
			This.CLog("start was interrupted",3);
			return;
		};
		This._SO=0;
		
		var end=function(){
			if(This.state==3){
				This.state=1;
				This.resume();
			}
		};
		if(ctx.state=="suspended"){
			var tag="AudioContext resume: ";
			This.CLog(tag+"wait...");
			ctx.resume().then(function(){
				This.CLog(tag+ctx.state);
				end();
			})[CatchTxt](function(e){ //fairly rare; may have no effect on recording
				This.CLog(tag+ctx.state+" may be unable to record: "+e.message,1,e);
				end();
			});
		}else{
			end();
		};
	}
	/*Pause recording*/
	,pause:function(){
		var This=this;
		if(This.state){
			This.state=2;
			This.CLog("pause");
			delete This._streamStore().Stream._call[This.id];
		};
	}
	/*Resume recording*/
	,resume:function(){
		var This=this;
		if(This.state){
			This.state=1;
			This.CLog("resume");
			This.envResume();
			
			var stream=This._streamStore().Stream;
			stream._call[This.id]=function(pcm,sum){
				if(This.state==1){
					This.envIn(pcm,sum);
				};
			};
			ConnAlive(stream);//AudioWorklet only runs after ctx is activated
		};
	}
	
	
	
	
	,_stop:function(keepEngine){
		var This=this,set=This.set;
		if(!This.isMock){
			This._S++;
		};
		if(This.state){
			This.pause();
			This.state=0;
		};
		if(!keepEngine && This[set.type+"_stop"]){
			This[set.type+"_stop"](This.engineCtx);
			This.engineCtx=0;
		};
	}
	/*
	End the recording and return the recording data as a blob object
		True(blob,duration) blob: recording data in audio/mp3|wav format
							duration: recording duration, in milliseconds
		False(msg)
		autoClose:false optional, whether to call close automatically, defaults to false
	*/
	,stop:function(True,False,autoClose){
		var This=this,set=This.set,t1;
		var envInMS=This.envInLast-This.envInFirst, envInLen=envInMS&&This.buffers.length; //start may not have been called
		This.CLog("stop; time since start "+(envInMS?envInMS+"ms compensated "+This.envInFix+"ms"+" envIn:"+envInLen+" fps:"+(envInLen/envInMS*1000).toFixed(1):"-"));
		
		var end=function(){
			This._stop();//shut down engineCtx completely
			if(autoClose){
				This.close();
			};
		};
		var err=function(msg){
			This.CLog("Failed to end recording: "+msg,1);
			False&&False(msg);
			end();
		};
		var ok=function(blob,duration){
			This.CLog("Recording ended; encoding took "+(Date.now()-t1)+"ms, audio duration "+duration+"ms, file size "+blob.size+"b");
			if(set.takeoffEncodeChunk){//the output was taken over, so blob length is 0
				This.CLog("With takeoffEncodeChunk enabled, the blob returned by stop has length 0 and provides no audio data",3);
			}else if(blob.size<Math.max(100,duration/2)){//1 second smaller than 0.5k?
				err("The generated "+set.type+" is invalid");
				return;
			};
			True&&True(blob,duration);
			end();
		};
		if(!This.isMock){
			var isCtxWait=This.state==3;
			if(!This.state || isCtxWait){
				err("Recording has not started"+(isCtxWait?"; no user interaction before starting recording left the AudioContext not running":""));
				return;
			};
			This._stop(true);
		};
		var size=This.recSize;
		if(!size){
			err("No recording was captured");
			return;
		};
		if(!This.buffers[0]){
			err("The audio buffers have been released");
			return;
		};
		if(!This[set.type]){
			err("The "+set.type+" encoder is not loaded");
			return;
		};
		
		//environment configuration check; only for mock calls here, since open has already checked
		if(This.isMock){
			var checkMsg=This.envCheck(This.mockEnvInfo||{envName:"mock",canProcess:false});//a mock without environment info has no onProcess callback
			if(checkMsg){
				err("Recording error: "+checkMsg);
				return;
			};
		};
		
		//this type supports encode-while-recording (Worker)
		var engineCtx=This.engineCtx;
		if(This[set.type+"_complete"]&&engineCtx){
			var duration=Math.round(engineCtx.pcmSize/set[sampleRateTxt]*1000);//the resampled data length may differ slightly from the buffers length; a precision issue of continuous sample rate conversion
			
			t1=Date.now();
			This[set.type+"_complete"](engineCtx,function(blob){
				ok(blob,duration);
			},err);
			return;
		};
		
		//standard UI-thread transcoding, adjusting the sample rate
		t1=Date.now();
		var chunk=Recorder.SampleData(This.buffers,This[srcSampleRateTxt],set[sampleRateTxt]);
		
		set[sampleRateTxt]=chunk[sampleRateTxt];
		var res=chunk.data;
		var duration=Math.round(res.length/set[sampleRateTxt]*1000);
		
		This.CLog("Resampled "+size+"->"+res.length+" took:"+(Date.now()-t1)+"ms");
		
		setTimeout(function(){
			t1=Date.now();
			This[set.type](res,function(blob){
				ok(blob,duration);
			},function(msg){
				err(msg);
			});
		});
	}

};

if(window[RecTxt]){
	CLog(RecTxt+" was included repeatedly",3);
	window[RecTxt].Destroy();
};
window[RecTxt]=Recorder;




//=======Extract pcm data from a WebM byte stream; returns Float32Array on success, null||-1 on failure=====
var WebM_Extract=function(inBytes, scope){
	if(!scope.pos){
		scope.pos=[0]; scope.tracks={}; scope.bytes=[];
	};
	var tracks=scope.tracks, position=[scope.pos[0]];
	var endPos=function(){ scope.pos[0]=position[0] };
	
	var sBL=scope.bytes.length;
	var bytes=new Uint8Array(sBL+inBytes.length);
	bytes.set(scope.bytes); bytes.set(inBytes,sBL);
	scope.bytes=bytes;
	
	//first read the file header and Track info
	if(!scope._ht){
		readMatroskaVInt(bytes, position);//EBML Header
		readMatroskaBlock(bytes, position);//skip the EBML Header content
		if(!BytesEq(readMatroskaVInt(bytes, position), [0x18,0x53,0x80,0x67])){
			return;//Segment not recognized
		}
		readMatroskaVInt(bytes, position);//skip the Segment length value
		while(position[0]<bytes.length){
			var eid0=readMatroskaVInt(bytes, position);
			var bytes0=readMatroskaBlock(bytes, position);
			var pos0=[0],audioIdx=0;
			if(!bytes0)return;//incomplete data; wait for buffering
			//complete Track data; loop through TrackEntry elements
			if(BytesEq(eid0, [0x16,0x54,0xAE,0x6B])){
				while(pos0[0]<bytes0.length){
					var eid1=readMatroskaVInt(bytes0, pos0);
					var bytes1=readMatroskaBlock(bytes0, pos0);
					var pos1=[0],track={channels:0,sampleRate:0};
					if(BytesEq(eid1, [0xAE])){//TrackEntry
						while(pos1[0]<bytes1.length){
							var eid2=readMatroskaVInt(bytes1, pos1);
							var bytes2=readMatroskaBlock(bytes1, pos1);
							var pos2=[0];
							if(BytesEq(eid2, [0xD7])){//Track Number
								var val=BytesInt(bytes2);
								track.number=val;
								tracks[val]=track;
							}else if(BytesEq(eid2, [0x83])){//Track Type
								var val=BytesInt(bytes2);
								if(val==1) track.type="video";
								else if(val==2) {
									track.type="audio";
									if(!audioIdx) scope.track0=track;
									track.idx=audioIdx++;
								}else track.type="Type-"+val;
							}else if(BytesEq(eid2, [0x86])){//Track Codec
								var str="";
								for(var i=0;i<bytes2.length;i++){
									str+=String.fromCharCode(bytes2[i]);
								}
								track.codec=str;
							}else if(BytesEq(eid2, [0xE1])){
								while(pos2[0]<bytes2.length){//loop through Audio attributes
									var eid3=readMatroskaVInt(bytes2, pos2);
									var bytes3=readMatroskaBlock(bytes2, pos2);
									//sample rate, bit depth, channel count
									if(BytesEq(eid3, [0xB5])){
										var val=0,arr=new Uint8Array(bytes3.reverse()).buffer;
										if(bytes3.length==4) val=new Float32Array(arr)[0];
										else if(bytes3.length==8) val=new Float64Array(arr)[0];
										else CLog("WebM Track !Float",1,bytes3);
										track[sampleRateTxt]=Math.round(val);
									}else if(BytesEq(eid3, [0x62,0x64])) track.bitDepth=BytesInt(bytes3);
									else if(BytesEq(eid3, [0x9F])) track.channels=BytesInt(bytes3);
								}
							}
						}
					}
				};
				scope._ht=1;
				CLog("WebM Tracks",tracks);
				endPos();
				break;
			}
		}
	}
	
	//Validate the audio parameter info; if it does not meet the code's requirements, refuse to process altogether
	var track0=scope.track0;
	if(!track0)return;
	if(track0.bitDepth==16 && /FLOAT/i.test(track0.codec)){
		track0.bitDepth=32; //chrome v66 actually uses floating point
		CLog("WebM 16 changed to 32-bit",3);
	}
	if(track0[sampleRateTxt]!=scope[sampleRateTxt] || track0.bitDepth!=32 || track0.channels<1 || !/(\b|_)PCM\b/i.test(track0.codec)){
		scope.bytes=[];//unexpected format, cannot process; clear the buffered data
		if(!scope.bad)CLog("WebM Track is unexpected",3,scope);
		scope.bad=1;
		return -1;
	}
	
	//Loop through the SimpleBlocks inside the Cluster
	var datas=[],dataLen=0;
	while(position[0]<bytes.length){
		var eid1=readMatroskaVInt(bytes, position);
		var bytes1=readMatroskaBlock(bytes, position);
		if(!bytes1)break;//incomplete data; wait for buffering
		if(BytesEq(eid1, [0xA3])){//complete SimpleBlock data
			var trackNo=bytes1[0]&0xf;
			var track=tracks[trackNo];
			if(!track){//should never be missing; corrupted data?
				CLog("WebM !Track"+trackNo,1,tracks);
			}else if(track.idx===0){
				var u8arr=new Uint8Array(bytes1.length-4);
				for(var i=4;i<bytes1.length;i++){
					u8arr[i-4]=bytes1[i];
				}
				datas.push(u8arr); dataLen+=u8arr.length;
			}
		}
		endPos();
	}
	
	if(dataLen){
		var more=new Uint8Array(bytes.length-scope.pos[0]);
		more.set(bytes.subarray(scope.pos[0]));
		scope.bytes=more; //clear the buffered data that has been read
		scope.pos[0]=0;
		
		var u8arr=new Uint8Array(dataLen); //the audio data obtained so far
		for(var i=0,i2=0;i<datas.length;i++){
			u8arr.set(datas[i],i2);
			i2+=datas[i].length;
		}
		var arr=new Float32Array(u8arr.buffer);
		
		if(track0.channels>1){//multi-channel; extract one channel
			var arr2=[];
			for(var i=0;i<arr.length;){
				arr2.push(arr[i]);
				i+=track0.channels;
			}
			arr=new Float32Array(arr2);
		};
		return arr;
	}
};
//Whether two byte arrays have identical contents
var BytesEq=function(bytes1,bytes2){
	if(!bytes1 || bytes1.length!=bytes2.length) return false;
	if(bytes1.length==1) return bytes1[0]==bytes2[0];
	for(var i=0;i<bytes1.length;i++){
		if(bytes1[i]!=bytes2[i]) return false;
	}
	return true;
};
//Convert a BE byte array into an int number
var BytesInt=function(bytes){
	var s="";//0-8 bytes; js bitwise operations only support 4 bytes
	for(var i=0;i<bytes.length;i++){var n=bytes[i];s+=(n<16?"0":"")+n.toString(16)};
	return parseInt(s,16)||0;
};
//Read a variable-length integer byte array
var readMatroskaVInt=function(arr,pos,trim){
	var i=pos[0];
	if(i>=arr.length)return;
	var b0=arr[i],b2=("0000000"+b0.toString(2)).substr(-8);
	var m=/^(0*1)(\d*)$/.exec(b2);
	if(!m)return;
	var len=m[1].length, val=[];
	if(i+len>arr.length)return;
	for(var i2=0;i2<len;i2++){ val[i2]=arr[i]; i++; }
	if(trim) val[0]=parseInt(m[2]||'0',2);
	pos[0]=i;
	return val;
};
//Read a content byte array that carries its own length
var readMatroskaBlock=function(arr,pos){
	var lenVal=readMatroskaVInt(arr,pos,1);
	if(!lenVal)return;
	var len=BytesInt(lenVal);
	var i=pos[0], val=[];
	if(len<0x7FFFFFFF){ //a huge value means there is no length
		if(i+len>arr.length)return;
		for(var i2=0;i2<len;i2++){ val[i2]=arr[i]; i++; }
	}
	pos[0]=i;
	return val;
};
//=====End WebM reading=====




//1-pixel image URL for traffic statistics; set it to empty to opt out of statistics
Recorder.TrafficImgUrl="//ia.51.la/go1?id=20469973&pvFlag=1";
var Traffic=Recorder.Traffic=function(report){
	report=report?"/"+RecTxt+"/Report/"+report:"";
	var imgUrl=Recorder.TrafficImgUrl;
	if(imgUrl){
		var data=Recorder.Traffic;
		var m=/^(https?:..[^\/#]*\/?)[^#]*/i.exec(location.href)||[];
		var host=(m[1]||"http://file/");
		var idf=(m[0]||host)+report;
		
		if(imgUrl.indexOf("//")==0){
			//add the http prefix to the url; under the file protocol it cannot be used without the prefix
			if(/^https:/i.test(idf)){
				imgUrl="https:"+imgUrl;
			}else{
				imgUrl="http:"+imgUrl;
			};
		};
		if(report){
			imgUrl=imgUrl+"&cu="+encodeURIComponent(host+report);
		};
		
		if(!data[idf]){
			data[idf]=1;
			
			var img=new Image();
			img.src=imgUrl;
			CLog("Traffic Analysis Image: "+(report||RecTxt+".TrafficImgUrl="+Recorder.TrafficImgUrl));
		};
	};
};

}));