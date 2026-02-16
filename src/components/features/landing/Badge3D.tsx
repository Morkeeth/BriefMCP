'use client'

import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { Canvas, extend, useThree, useFrame } from '@react-three/fiber'
import { Environment, Lightformer, Text, RoundedBox } from '@react-three/drei'
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from '@react-three/rapier'
import { MeshLineGeometry, MeshLineMaterial } from 'meshline'

extend({ MeshLineGeometry, MeshLineMaterial })

function Band() {
  const band = useRef<THREE.Mesh>(null)
  const fixed = useRef<any>(null)
  const j1 = useRef<any>(null)
  const j2 = useRef<any>(null)
  const j3 = useRef<any>(null)
  const card = useRef<any>(null)

  const vec = new THREE.Vector3()
  const ang = new THREE.Vector3()
  const rot = new THREE.Vector3()
  const dir = new THREE.Vector3()

  const segmentProps = {
    type: 'dynamic' as const,
    canSleep: true,
    colliders: false as const,
    angularDamping: 4,
    linearDamping: 4
  }

  const { width, height } = useThree((state) => state.size)
  const [curve] = useState(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3()
  ]))
  const [dragged, setDragged] = useState<THREE.Vector3 | false>(false)
  const [hovered, setHovered] = useState(false)

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1])
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1])
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1])
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.45, 0]])

  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? 'grabbing' : 'grab'
      return () => {
        document.body.style.cursor = 'auto'
      }
    }
  }, [hovered, dragged])

  useFrame(() => {
    if (dragged && card.current) {
      vec.set(0, 0, 0.5).unproject(card.current)
      dir.copy(vec).sub(new THREE.Vector3()).normalize()
      vec.add(dir.multiplyScalar(13))
      ;[card, j1, j2, j3, fixed].forEach((ref) => ref.current?.wakeUp())
      card.current?.setNextKinematicTranslation({
        x: vec.x - dragged.x,
        y: vec.y - dragged.y,
        z: vec.z - dragged.z
      })
    }
    if (fixed.current && card.current && j1.current && j2.current && j3.current && band.current) {
      // Calculate catmull curve
      curve.points[0].copy(j3.current.translation())
      curve.points[1].copy(j2.current.translation())
      curve.points[2].copy(j1.current.translation())
      curve.points[3].copy(fixed.current.translation())
      ;(band.current.geometry as any).setPoints(curve.getPoints(32))
      // Tilt it back towards the screen
      ang.copy(card.current.angvel())
      rot.copy(card.current.rotation())
      card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z }, true)
    }
  })

  return (
    <>
      <group position={[0, 3, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody
          position={[2, 0, 0]}
          ref={card}
          {...segmentProps}
          type={dragged ? 'kinematicPosition' : 'dynamic'}
        >
          <CuboidCollider args={[0.8, 1.125, 0.01]} />
          <group
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
            onPointerUp={(e: any) => {
              e.target.releasePointerCapture(e.pointerId)
              setDragged(false)
            }}
            onPointerDown={(e: any) => {
              e.target.setPointerCapture(e.pointerId)
              setDragged(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current!.translation())))
            }}
          >
            {/* Card background */}
            <RoundedBox args={[1.6, 2.25, 0.05]} radius={0.05} smoothness={4}>
              <meshPhysicalMaterial
                color="#0a0a0a"
                metalness={0.1}
                roughness={0.4}
                clearcoat={0.3}
                clearcoatRoughness={0.2}
              />
            </RoundedBox>

            {/* Brief logo area */}
            <mesh position={[0, 0.6, 0.03]}>
              <planeGeometry args={[1.2, 0.4]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>

            {/* Text: Brief */}
            <Text
              position={[0, 0.6, 0.04]}
              fontSize={0.25}
              color="#0a0a0a"
              anchorX="center"
              anchorY="middle"
            >
              Brief
            </Text>

            {/* Tagline */}
            <Text
              position={[0, 0.1, 0.03]}
              fontSize={0.1}
              color="#888888"
              anchorX="center"
              anchorY="middle"
              maxWidth={1.4}
              textAlign="center"
            >
              AI Context Platform
            </Text>

            {/* Decorative line */}
            <mesh position={[0, -0.15, 0.03]}>
              <planeGeometry args={[1.2, 0.005]} />
              <meshBasicMaterial color="#333333" />
            </mesh>

            {/* Bottom section */}
            <Text
              position={[0, -0.5, 0.03]}
              fontSize={0.08}
              color="#666666"
              anchorX="center"
              anchorY="middle"
              maxWidth={1.3}
              textAlign="center"
            >
              {`Knowledge Base for\nAI Coding Agents`}
            </Text>

            {/* Small decorative elements */}
            <mesh position={[-0.5, -0.85, 0.03]}>
              <circleGeometry args={[0.03, 16]} />
              <meshBasicMaterial color="#22c55e" />
            </mesh>
            <Text
              position={[0, -0.85, 0.03]}
              fontSize={0.06}
              color="#22c55e"
              anchorX="center"
              anchorY="middle"
            >
              MCP Connected
            </Text>
          </group>
        </RigidBody>
      </group>
      <mesh ref={band}>
        {/* @ts-ignore */}
        <meshLineGeometry />
        {/* @ts-ignore */}
        <meshLineMaterial
          color="#ffffff"
          depthTest={false}
          resolution={[width, height]}
          lineWidth={1}
        />
      </mesh>
    </>
  )
}

export function Badge3D() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <div className="animate-pulse text-muted-foreground">Loading 3D...</div>
      </div>
    )
  }

  return (
    <div className="w-full h-full">
      <Canvas camera={{ position: [0, 0, 13], fov: 25 }}>
        <ambientLight intensity={Math.PI} />
        <Physics gravity={[0, -20, 0]} timeStep={1 / 60}>
          <Band />
        </Physics>
        <Environment>
          <Lightformer
            intensity={2}
            color="white"
            position={[0, -1, 5]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={3}
            color="white"
            position={[-1, -1, 1]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={3}
            color="white"
            position={[1, 1, 1]}
            rotation={[0, 0, Math.PI / 3]}
            scale={[100, 0.1, 1]}
          />
          <Lightformer
            intensity={10}
            color="white"
            position={[-10, 0, 14]}
            rotation={[0, Math.PI / 2, Math.PI / 3]}
            scale={[100, 10, 1]}
          />
        </Environment>
      </Canvas>
    </div>
  )
}
