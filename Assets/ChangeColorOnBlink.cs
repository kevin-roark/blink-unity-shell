using UnityEngine;
using System.Collections;

public class ChangeColorOnBlink : MonoBehaviour {

	// Use this for initialization
	void Start () {
	
	}
	
	// Update is called once per frame
	void Update () {
	
	}
	public void blinkDown() {
		renderer.material.color = new Color (Random.value, Random.value, Random.value);
	}
}
